import { hostname } from 'node:os';
import type { FastifyLoggerOptions } from 'fastify';

const LOG_GROUP =
  process.env.CLOUDWATCH_LOG_GROUP ?? '/aws/bedrock-agentcore/runtimes/deck-forge';
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

export function buildLoggerOptions(): FastifyLoggerOptions {
  const logStreamName = `${hostname()}-${Date.now()}`;

  return {
    level: 'info',
    transport: {
      targets: [
        { target: 'pino/file', options: { destination: 1 }, level: 'info' },
        {
          target: '@serdnam/pino-cloudwatch-transport',
          options: {
            logGroupName: LOG_GROUP,
            logStreamName,
            awsRegion: AWS_REGION,
            interval: 2_000,
          },
          level: 'info',
        },
      ],
    },
  } as FastifyLoggerOptions;
}
