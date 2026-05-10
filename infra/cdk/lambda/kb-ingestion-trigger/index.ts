import {
  BedrockAgentClient,
  ListIngestionJobsCommand,
  StartIngestionJobCommand,
} from '@aws-sdk/client-bedrock-agent';

const client = new BedrockAgentClient({});
const KB_ID = process.env.KB_ID ?? '';
const DATA_SOURCE_ID = process.env.DATA_SOURCE_ID ?? '';

export const handler = async (): Promise<void> => {
  const list = await client.send(
    new ListIngestionJobsCommand({
      knowledgeBaseId: KB_ID,
      dataSourceId: DATA_SOURCE_ID,
      filters: [{ attribute: 'STATUS', operator: 'EQ', values: ['IN_PROGRESS'] }],
    }),
  );

  if ((list.ingestionJobSummaries ?? []).length > 0) {
    console.log('Ingestion job already IN_PROGRESS — skipping');
    return;
  }

  const start = await client.send(
    new StartIngestionJobCommand({
      knowledgeBaseId: KB_ID,
      dataSourceId: DATA_SOURCE_ID,
    }),
  );

  console.log(`Started ingestion job: ${start.ingestionJob?.ingestionJobId}`);
};
