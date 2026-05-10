import { RemovalPolicy } from 'aws-cdk-lib';
import type { CfnKnowledgeBase } from 'aws-cdk-lib/aws-bedrock';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { CfnIndex, CfnVectorBucket } from 'aws-cdk-lib/aws-s3vectors';
import type { Construct } from 'constructs';
import { VectorStore, type VectorStoreProps } from './vector-store.js';

export interface S3VectorsStoreProps extends VectorStoreProps {
  /** Name of the S3 vector bucket (3–63 chars, lowercase, hyphens allowed). */
  readonly vectorBucketName?: string;
  /** Name of the vector index inside the bucket. */
  readonly indexName?: string;
  /** Number of vector dimensions. Must match the embedding model output. */
  readonly dimensions?: number;
}

/**
 * Provisions an S3 vector bucket and a vector index, then wires them to a
 * Bedrock Knowledge Base role.
 *
 * Simpler and cheaper than OpenSearch Serverless — recommended for PoC / dev
 * environments or lower-throughput production workloads.
 */
export class S3VectorsStore extends VectorStore {
  readonly storageConfiguration: CfnKnowledgeBase.StorageConfigurationProperty;

  readonly vectorBucketArn: string;
  readonly indexArn: string;

  constructor(scope: Construct, id: string, props: S3VectorsStoreProps) {
    super(scope, id);

    const { stage, kbRole } = props;
    const indexName = props.indexName ?? 'bedrock-kb-index';
    const dimensions = props.dimensions ?? 1024;
    const isDevStage = stage === 'dev';

    // S3 vector bucket — specialized storage for vector embeddings.
    const vectorBucket = new CfnVectorBucket(this, 'VectorBucket', {
      ...(props.vectorBucketName ? { vectorBucketName: props.vectorBucketName } : {}),
      tags: [
        { key: 'Project', value: 'agentra' },
        { key: 'ManagedBy', value: 'cdk' },
        { key: 'Stage', value: stage },
      ],
    });
    // CfnVectorBucket does not support RemovalPolicy natively; apply via override.
    vectorBucket.applyRemovalPolicy(
      isDevStage ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    );

    // Vector index inside the bucket.
    // distanceMetric 'euclidean' is equivalent to l2 used in the AOSS implementation.
    const vectorIndex = new CfnIndex(this, 'VectorIndex', {
      vectorBucketArn: vectorBucket.attrVectorBucketArn,
      indexName,
      dataType: 'float32',
      dimension: dimensions,
      distanceMetric: 'euclidean',
      tags: [
        { key: 'Project', value: 'agentra' },
        { key: 'ManagedBy', value: 'cdk' },
      ],
    });
    vectorIndex.addDependency(vectorBucket);

    // Grant the KB role permissions to read/write vectors.
    kbRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          's3vectors:GetIndex',
          's3vectors:DescribeIndex',
          's3vectors:PutVectors',
          's3vectors:GetVectors',
          's3vectors:DeleteVectors',
          's3vectors:QueryVectors',
          's3vectors:ListVectors',
        ],
        resources: [vectorIndex.attrIndexArn, vectorBucket.attrVectorBucketArn],
      }),
    );

    this.vectorBucketArn = vectorBucket.attrVectorBucketArn;
    this.indexArn = vectorIndex.attrIndexArn;

    this.storageConfiguration = {
      type: 'S3_VECTORS',
      s3VectorsConfiguration: {
        vectorBucketArn: vectorBucket.attrVectorBucketArn,
        indexArn: vectorIndex.attrIndexArn,
      },
    };
  }
}
