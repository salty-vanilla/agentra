import {
  BedrockAgentClient,
  ListIngestionJobsCommand,
  StartIngestionJobCommand,
} from '@aws-sdk/client-bedrock-agent';
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';

const client = new BedrockAgentClient({});
const KB_ID = process.env.KB_ID ?? '';
const DATA_SOURCE_ID = process.env.DATA_SOURCE_ID ?? '';

export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const list = await client.send(
    new ListIngestionJobsCommand({
      knowledgeBaseId: KB_ID,
      dataSourceId: DATA_SOURCE_ID,
      filters: [{ attribute: 'STATUS', operator: 'EQ', values: ['IN_PROGRESS'] }],
    }),
  );

  if ((list.ingestionJobSummaries ?? []).length > 0) {
    // An ingestion job is already running. Report all messages as failures so
    // SQS requeues them after the visibility timeout — guaranteeing a follow-up
    // ingestion attempt once the current job completes.
    console.log(
      JSON.stringify({
        level: 'INFO',
        event: 'skip_active_job',
        action: 'requeue',
        messageCount: event.Records.length,
      }),
    );
    return {
      batchItemFailures: event.Records.map((r) => ({ itemIdentifier: r.messageId })),
    };
  }

  const start = await client.send(
    new StartIngestionJobCommand({
      knowledgeBaseId: KB_ID,
      dataSourceId: DATA_SOURCE_ID,
    }),
  );

  console.log(
    JSON.stringify({
      level: 'INFO',
      event: 'started_ingestion',
      jobId: start.ingestionJob?.ingestionJobId,
      messageCount: event.Records.length,
    }),
  );
  return { batchItemFailures: [] };
};
