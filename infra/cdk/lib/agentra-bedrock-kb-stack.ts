import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnDataSource, CfnKnowledgeBase } from 'aws-cdk-lib/aws-bedrock';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  CfnAccessPolicy,
  CfnCollection,
  CfnIndex,
  CfnSecurityPolicy,
} from 'aws-cdk-lib/aws-opensearchserverless';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

// Bedrock Titan Embeddings v2 produces 1024-dimensional vectors.
const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const EMBEDDING_DIMENSIONS = 1024;

// Field names expected by Bedrock KB in the AOSS index.
const VECTOR_FIELD = 'bedrock-knowledge-base-default-vector';
const TEXT_FIELD = 'AMAZON_BEDROCK_TEXT_CHUNK';
const METADATA_FIELD = 'AMAZON_BEDROCK_METADATA';
const VECTOR_INDEX_NAME = 'bedrock-kb-index';

export interface AgentraBedrockKbStackProps extends StackProps {
  stage: string;
}

export class AgentraBedrockKbStack extends Stack {
  readonly knowledgeBaseId: string;
  readonly knowledgeBaseArn: string;
  readonly documentBucketName: string;

  constructor(scope: Construct, id: string, props: AgentraBedrockKbStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const isDevStage = stage === 'dev';

    // AOSS naming: lowercase, 3-28 chars, start with letter, alphanumeric and hyphens only.
    // Use a short prefix to stay within the 28-char limit.
    const collectionName = `agentra-${stage}-mfg-kb`.slice(0, 28);

    // --- S3 document source bucket ---
    const documentBucket = new Bucket(this, 'ManufacturingDocBucket', {
      bucketName: `agentra-${stage}-manufacturing-docs`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: isDevStage ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: isDevStage,
    });

    // --- IAM role for Bedrock Knowledge Base ---
    const kbRole = new Role(this, 'BedrockKbRole', {
      assumedBy: new ServicePrincipal('bedrock.amazonaws.com', {
        conditions: {
          StringEquals: { 'aws:SourceAccount': this.account },
          ArnLike: {
            'aws:SourceArn': `arn:aws:bedrock:${this.region}:${this.account}:knowledge-base/*`,
          },
        },
      }),
      description:
        'Execution role for Agentra manufacturing-line Bedrock Knowledge Base.',
    });

    kbRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${EMBEDDING_MODEL_ID}`,
        ],
      }),
    );

    // Allow KB role to read documents from S3
    documentBucket.grantRead(kbRole);

    // Allow KB role to list the bucket (needed for sync)
    kbRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [documentBucket.bucketArn],
      }),
    );

    // --- OpenSearch Serverless: encryption policy (required before collection) ---
    const encryptionPolicy = new CfnSecurityPolicy(this, 'AossEncryptionPolicy', {
      name: `${collectionName}-enc`,
      type: 'encryption',
      policy: JSON.stringify({
        Rules: [
          { ResourceType: 'collection', Resource: [`collection/${collectionName}`] },
        ],
        AWSOwnedKey: true,
      }),
    });

    // --- OpenSearch Serverless: network policy (public access for PoC) ---
    const networkPolicy = new CfnSecurityPolicy(this, 'AossNetworkPolicy', {
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

    // --- OpenSearch Serverless collection ---
    const collection = new CfnCollection(this, 'AossCollection', {
      name: collectionName,
      type: 'VECTORSEARCH',
      description: `Agentra ${stage} manufacturing-line KB vector store.`,
      standbyReplicas: isDevStage ? 'DISABLED' : 'ENABLED',
      tags: [
        { key: 'Project', value: 'agentra' },
        { key: 'ManagedBy', value: 'cdk' },
      ],
    });
    collection.addDependency(encryptionPolicy);
    collection.addDependency(networkPolicy);

    // --- AOSS data access policy: allow Bedrock KB role to manage collection/indices ---
    const accessPolicy = new CfnAccessPolicy(this, 'AossDataAccessPolicy', {
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
          Description: 'Allow Bedrock KB role to read/write the vector index.',
        },
      ]),
    });
    accessPolicy.addDependency(collection);

    // Allow KB role to call AOSS API
    kbRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['aoss:APIAccessAll'],
        resources: [collection.attrArn],
      }),
    );

    // --- AOSS vector index ---
    const vectorIndex = new CfnIndex(this, 'AossVectorIndex', {
      collectionEndpoint: collection.attrCollectionEndpoint,
      indexName: VECTOR_INDEX_NAME,
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
            dimension: EMBEDDING_DIMENSIONS,
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

    // --- Bedrock Knowledge Base ---
    const kb = new CfnKnowledgeBase(this, 'ManufacturingKb', {
      name: `agentra-${stage}-manufacturing-doc-kb`,
      description: 'Normal document RAG KB for Agentra manufacturing-line agent.',
      roleArn: kbRole.roleArn,
      knowledgeBaseConfiguration: {
        type: 'VECTOR',
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${this.region}::foundation-model/${EMBEDDING_MODEL_ID}`,
        },
      },
      storageConfiguration: {
        type: 'OPENSEARCH_SERVERLESS',
        opensearchServerlessConfiguration: {
          collectionArn: collection.attrArn,
          vectorIndexName: VECTOR_INDEX_NAME,
          fieldMapping: {
            vectorField: VECTOR_FIELD,
            textField: TEXT_FIELD,
            metadataField: METADATA_FIELD,
          },
        },
      },
      tags: {
        Project: 'agentra',
        ManagedBy: 'cdk',
        Stage: stage,
      },
    });
    kb.addDependency(vectorIndex);

    // --- S3 data source ---
    const dataSource = new CfnDataSource(this, 'ManufacturingS3DataSource', {
      knowledgeBaseId: kb.attrKnowledgeBaseId,
      name: `agentra-${stage}-manufacturing-docs`,
      description: 'Manufacturing line documents from S3.',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: documentBucket.bucketArn,
          inclusionPrefixes: ['docs/'],
        },
      },
      dataDeletionPolicy: isDevStage ? 'DELETE' : 'RETAIN',
    });
    dataSource.addDependency(kb);

    this.knowledgeBaseId = kb.attrKnowledgeBaseId;
    this.knowledgeBaseArn = kb.attrKnowledgeBaseArn;
    this.documentBucketName = documentBucket.bucketName;

    new CfnOutput(this, 'BedrockKbId', {
      value: this.knowledgeBaseId,
      exportName: `${id}-BedrockKbId`,
      description: 'BEDROCK_KB_ID — set this env var on the AgentCore Runtime.',
    });
    new CfnOutput(this, 'BedrockKbRegion', {
      value: this.region,
      exportName: `${id}-BedrockKbRegion`,
      description: 'BEDROCK_KB_REGION — set this env var on the AgentCore Runtime.',
    });
    new CfnOutput(this, 'BedrockKbArn', { value: this.knowledgeBaseArn });
    new CfnOutput(this, 'ManufacturingDocBucketName', {
      value: this.documentBucketName,
      description: 'S3 bucket for uploading manufacturing-line source documents.',
    });
    new CfnOutput(this, 'AossCollectionArn', { value: collection.attrArn });
    new CfnOutput(this, 'AossCollectionEndpoint', {
      value: collection.attrCollectionEndpoint,
    });
  }
}
