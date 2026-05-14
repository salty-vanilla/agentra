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
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
  type LifecycleRule,
  StorageClass,
} from 'aws-cdk-lib/aws-s3';
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
    // PoC lifecycle: transition non-current versions to cheaper storage after 30 days;
    // expire them after 90 days to keep the bucket from accumulating stale drafts.
    const pocLifecycleRules: LifecycleRule[] = [
      {
        id: 'expire-noncurrent-versions',
        enabled: true,
        noncurrentVersionTransitions: [
          {
            storageClass: StorageClass.INFREQUENT_ACCESS,
            transitionAfter: Duration.days(30),
          },
        ],
        noncurrentVersionExpiration: Duration.days(90),
        expiredObjectDeleteMarker: true,
      },
    ];

    const documentBucket = new Bucket(this, 'ManufacturingDocBucket', {
      bucketName: `agentra-${stage}-manufacturing-docs`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      eventBridgeEnabled: true,
      lifecycleRules: pocLifecycleRules,
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
    // kbRole's DefaultPolicy (AWS::IAM::Policy) is created in parallel with the KB by default.
    // Bedrock validates S3 Vectors permissions immediately on KB creation, so the policy must
    // be fully applied first.
    const kbRoleDefaultPolicy = kbRole.node.tryFindChild('DefaultPolicy');
    if (kbRoleDefaultPolicy) {
      kb.node.addDependency(kbRoleDefaultPolicy);
    }

    // --- S3 data source ---
    const dataSource = new CfnDataSource(this, 'ManufacturingS3DataSource', {
      knowledgeBaseId: kb.attrKnowledgeBaseId,
      name: `agentra-${stage}-manufacturing-docs`,
      description: 'Manufacturing line documents from S3.',
      dataSourceConfiguration: {
        type: 'S3',
        s3Configuration: {
          bucketArn: documentBucket.bucketArn,
          inclusionPrefixes: ['manufacturing-line/'],
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

    // Lambda checks for an active job then starts one if none running.
    // Concurrency 1 prevents the TOCTOU race where multiple instances all pass
    // the ListIngestionJobs check and then race to call StartIngestionJob.
    const ingestionTrigger = new NodejsFunction(this, 'KbIngestionTrigger', {
      entry: join(__dirname, '../lambda/kb-ingestion-trigger/index.ts'),
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
      reservedConcurrentExecutions: 1,
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
        actions: ['bedrock:ListIngestionJobs', 'bedrock:StartIngestionJob'],
        resources: [kb.attrKnowledgeBaseArn],
      }),
    );

    // 60-second batch window coalesces burst uploads into a single invocation.
    // reservedConcurrentExecutions: 1 on the function already ensures at most one
    // invocation runs at a time; no additional maxConcurrency needed here.
    // reportBatchItemFailures lets the handler requeue individual messages by
    // returning their messageId in batchItemFailures — used when an ingestion
    // job is already IN_PROGRESS so the event is retried rather than dropped.
    ingestionTrigger.addEventSource(
      new SqsEventSource(ingestionQueue, {
        batchSize: 10,
        maxBatchingWindow: Duration.seconds(60),
        reportBatchItemFailures: true,
      }),
    );

    // EventBridge rule: Object Created on docs/ prefix → SQS
    new Rule(this, 'S3DocsCreatedRule', {
      eventPattern: {
        source: ['aws.s3'],
        detailType: ['Object Created'],
        detail: {
          bucket: { name: [documentBucket.bucketName] },
          object: { key: [{ prefix: 'manufacturing-line/' }] },
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
