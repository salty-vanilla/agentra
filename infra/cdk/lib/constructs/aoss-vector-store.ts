import type { CfnKnowledgeBase } from 'aws-cdk-lib/aws-bedrock';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  CfnAccessPolicy,
  CfnCollection,
  CfnIndex,
  CfnSecurityPolicy,
} from 'aws-cdk-lib/aws-opensearchserverless';
import type { Construct } from 'constructs';
import { VectorStore, type VectorStoreProps } from './vector-store.js';

// Field names required by Bedrock KB in the AOSS index.
const VECTOR_FIELD = 'bedrock-knowledge-base-default-vector';
const TEXT_FIELD = 'AMAZON_BEDROCK_TEXT_CHUNK';
const METADATA_FIELD = 'AMAZON_BEDROCK_METADATA';

export interface AossVectorStoreProps extends VectorStoreProps {
  /**
   * AOSS collection name. Must be lowercase, 3–28 chars, start with a letter,
   * contain only alphanumeric characters and hyphens.
   */
  readonly collectionName: string;
  /** Name of the kNN vector index created inside the collection. */
  readonly indexName?: string;
  /** Number of vector dimensions. Must match the embedding model output. */
  readonly dimensions?: number;
}

/**
 * Provisions an OpenSearch Serverless VECTORSEARCH collection, a kNN vector
 * index, and the required security / access policies, then wires them to a
 * Bedrock Knowledge Base role.
 */
export class AossVectorStore extends VectorStore {
  readonly storageConfiguration: CfnKnowledgeBase.StorageConfigurationProperty;

  readonly collectionArn: string;
  readonly collectionEndpoint: string;

  constructor(scope: Construct, id: string, props: AossVectorStoreProps) {
    super(scope, id);

    const { stage, kbRole, collectionName } = props;
    const indexName = props.indexName ?? 'bedrock-kb-index';
    const dimensions = props.dimensions ?? 1024;
    const isDevStage = stage === 'dev';

    // Encryption policy — required before collection creation.
    const encryptionPolicy = new CfnSecurityPolicy(this, 'EncryptionPolicy', {
      name: `${collectionName}-enc`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          { ResourceType: 'collection', Resource: [`collection/${collectionName}`] },
        ],
        AWSOwnedKey: true,
      }),
    });

    // Network policy — public access (tighten to VPC endpoint for production).
    const networkPolicy = new CfnSecurityPolicy(this, 'NetworkPolicy', {
      name: `${collectionName}-net`,
      type: 'network',
      policy: JSON.stringify([
        {
          Rules: [
            { ResourceType: 'collection', Resource: [`collection/${collectionName}`] },
            { ResourceType: 'dashboard', Resource: [`collection/${collectionName}`] },
          ],
          AllowFromPublic: true,
        },
      ]),
    });

    // VECTORSEARCH collection.
    const collection = new CfnCollection(this, 'Collection', {
      name: collectionName,
      type: 'VECTORSEARCH',
      description: `Agentra ${stage} KB vector store (OpenSearch Serverless).`,
      standbyReplicas: isDevStage ? 'DISABLED' : 'ENABLED',
      tags: [
        { key: 'Project', value: 'agentra' },
        { key: 'ManagedBy', value: 'cdk' },
      ],
    });
    collection.addDependency(encryptionPolicy);
    collection.addDependency(networkPolicy);

    // Data access policy: grant the KB role full index read/write.
    const accessPolicy = new CfnAccessPolicy(this, 'DataAccessPolicy', {
      name: `${collectionName}-access`,
      type: 'data',
      policy: JSON.stringify([
        {
          Rules: [
            {
              ResourceType: 'collection',
              Resource: [`collection/${collectionName}`],
              Permission: [
                'aoss:CreateCollectionItems',
                'aoss:DeleteCollectionItems',
                'aoss:UpdateCollectionItems',
                'aoss:DescribeCollectionItems',
              ],
            },
            {
              ResourceType: 'index',
              Resource: [`index/${collectionName}/*`],
              Permission: [
                'aoss:CreateIndex',
                'aoss:DeleteIndex',
                'aoss:UpdateIndex',
                'aoss:DescribeIndex',
                'aoss:ReadDocument',
                'aoss:WriteDocument',
              ],
            },
          ],
          Principal: [kbRole.roleArn],
          Description: 'Bedrock KB role access to vector index.',
        },
      ]),
    });
    accessPolicy.addDependency(collection);

    // Allow the KB role to call AOSS data-plane API.
    kbRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['aoss:APIAccessAll'],
        resources: [collection.attrArn],
      }),
    );

    // kNN vector index with Bedrock KB field mapping.
    const vectorIndex = new CfnIndex(this, 'VectorIndex', {
      collectionEndpoint: collection.attrCollectionEndpoint,
      indexName,
      settings: {
        index: {
          knn: true,
          knnAlgoParamEfSearch: 512,
        },
      },
      mappings: {
        properties: {
          [VECTOR_FIELD]: {
            type: 'knn_vector',
            dimension: dimensions,
            method: {
              name: 'hnsw',
              engine: 'faiss',
              spaceType: 'l2',
              parameters: { efConstruction: 512, m: 16 },
            },
          },
          [TEXT_FIELD]: { type: 'text', index: true },
          [METADATA_FIELD]: { type: 'text', index: false },
        },
      },
    });
    vectorIndex.addDependency(accessPolicy);

    this.collectionArn = collection.attrArn;
    this.collectionEndpoint = collection.attrCollectionEndpoint;

    this.storageConfiguration = {
      type: 'OPENSEARCH_SERVERLESS',
      opensearchServerlessConfiguration: {
        collectionArn: collection.attrArn,
        vectorIndexName: indexName,
        fieldMapping: {
          vectorField: VECTOR_FIELD,
          textField: TEXT_FIELD,
          metadataField: METADATA_FIELD,
        },
      },
    };
  }
}
