import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnDataSource, CfnKnowledgeBase } from 'aws-cdk-lib/aws-bedrock';
import { Alarm, ComparisonOperator } from 'aws-cdk-lib/aws-cloudwatch';
import { Rule } from 'aws-cdk-lib/aws-events';
import { SqsQueue as SqsEventTarget } from 'aws-cdk-lib/aws-events-targets';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';
import { AossVectorStore } from './constructs/aoss-vector-store.js';
import { S3VectorsStore } from './constructs/s3-vectors-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const EMBEDDING_MODEL_ID = 'amazon.titan-embed-text-v2:0';
const EMBEDDING_DIMENSIONS = 1024;

export type VectorStoreType = 'opensearch-serverless' | 's3-vectors';

export interface AgentraBedrockKbStackProps extends StackProps {
  stage: string;
  /**
   * Which vector store backend to use for this Knowledge Base.
   *
   * - `'s3-vectors'` (default) — S3 Vector Buckets. Simpler, lower cost.
   *   Recommended for PoC and dev environments.
   * - `'opensearch-serverless'` — OpenSearch Serverless VECTORSEARCH collection.
   *   Lower latency; better for high-throughput production use cases.
   */
  vectorStoreType?: VectorStoreType;
}

export class AgentraBedrockKbStack extends Stack {
  readonly knowledgeBaseId: string;
  readonly knowledgeBaseArn: string;
  readonly documentBucketName: string;

  constructor(scope: Construct, id: string, props: AgentraBedrockKbStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const vectorStoreType = props.vectorStoreType ?? 's3-vectors';
    const isDevStage = stage === 'dev';

    // --- S3 document source bucket ---
    const documentBucket = new Bucket(this, 'ManufacturingDocBucket', {
      bucketName: `agentra-${stage}-manufacturing-docs`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      eventBridgeEnabled: true,
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

    documentBucket.grantRead(kbRole);

    kbRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [documentBucket.bucketArn],
      }),
    );

    // --- Vector store ---
    // AOSS naming: lowercase, 3–28 chars, start with letter, alphanumeric + hyphens.
    const collectionName = `agentra-${stage}-mfg-kb`.slice(0, 28);

    const vectorStore =
      vectorStoreType === 'opensearch-serverless'
        ? new AossVectorStore(this, 'VectorStore', {
            stage,
            kbRole,
            collectionName,
            dimensions: EMBEDDING_DIMENSIONS,
          })
        : new S3VectorsStore(this, 'VectorStore', {
            stage,
            kbRole,
            vectorBucketName: `agentra-${stage}-mfg-kb-vectors`,
            dimensions: EMBEDDING_DIMENSIONS,
          });

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
      storageConfiguration: vectorStore.storageConfiguration,
      tags: {
        Project: 'agentra',
        ManagedBy: 'cdk',
        Stage: stage,
        VectorStore: vectorStoreType,
      },
    });
    kb.node.addDependency(vectorStore);

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

    // --- Auto-ingestion trigger: S3 → EventBridge → SQS → Lambda ---

    // DLQ for failed Lambda invocations
    const ingestionDlq = new Queue(this, 'KbIngestionDlq', {
      queueName: `agentra-${stage}-kb-ingestion-dlq`,
      retentionPeriod: Duration.days(isDevStage ? 7 : 14),
      encryption: QueueEncryption.SQS_MANAGED,
      removalPolicy: isDevStage ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    // SQS buffer absorbs burst uploads; visibility timeout > Lambda timeout
    const ingestionQueue = new Queue(this, 'KbIngestionQueue', {
      queueName: `agentra-${stage}-kb-ingestion`,
      visibilityTimeout: Duration.seconds(300),
      retentionPeriod: Duration.days(isDevStage ? 1 : 4),
      encryption: QueueEncryption.SQS_MANAGED,
      deadLetterQueue: { queue: ingestionDlq, maxReceiveCount: 3 },
      removalPolicy: isDevStage ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    // Lambda checks for an active job then starts one if none running
    const ingestionTrigger = new NodejsFunction(this, 'KbIngestionTrigger', {
      entry: join(__dirname, '../lambda/kb-ingestion-trigger/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
      environment: {
        KB_ID: kb.attrKnowledgeBaseId,
        DATA_SOURCE_ID: dataSource.attrDataSourceId,
      },
      bundling: {
        // @aws-sdk/* is provided by the Node.js 22.x Lambda runtime
        externalModules: ['@aws-sdk/*'],
      },
    });

    ingestionTrigger.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock-agent:ListIngestionJobs', 'bedrock-agent:StartIngestionJob'],
        resources: [kb.attrKnowledgeBaseArn],
      }),
    );

    // 60-second batch window coalesces burst uploads into a single invocation
    ingestionTrigger.addEventSource(
      new SqsEventSource(ingestionQueue, {
        batchSize: 10,
        maxBatchingWindow: Duration.seconds(60),
      }),
    );

    // EventBridge rule: Object Created on docs/ prefix → SQS
    new Rule(this, 'S3DocsCreatedRule', {
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: { name: [documentBucket.bucketName] },
          object: { key: [{ prefix: 'docs/' }] },
        },
      },
      targets: [new SqsEventTarget(ingestionQueue)],
    });

    // Alarm fires when any message lands in the DLQ
    new Alarm(this, 'KbIngestionDlqAlarm', {
      metric: ingestionDlq.metricApproximateNumberOfMessagesVisible(),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      alarmDescription: `[${stage}] KB ingestion trigger Lambda failed — check DLQ agentra-${stage}-kb-ingestion-dlq`,
    });

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
    new CfnOutput(this, 'VectorStoreType', {
      value: vectorStoreType,
      description: 'Vector store backend used for this Knowledge Base.',
    });
  }
}
