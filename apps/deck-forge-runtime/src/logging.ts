import { hostname } from 'node:os';
import type { FastifyLoggerOptions } from 'fastify';
import pino, { type Logger, type TransportMultiOptions } from 'pino';

const LOG_GROUP =
  process.env.CLOUDWATCH_LOG_GROUP ?? '/aws/bedrock-agentcore/runtimes/deck-forge';
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

function buildTransport(): TransportMultiOptions {
  const logStreamName = `${hostname()}-${Date.now()}`;
  return {
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
  };
}

export function buildLoggerOptions(): FastifyLoggerOptions {
  return {
    level: 'info',
    transport: buildTransport(),
  } as FastifyLoggerOptions;
}

let cachedLogger: Logger | undefined;

/**
 * Shared pino logger that writes to stdout AND CloudWatch Logs via the same
 * multi-target transport used by the fastify request logger. Use this from
 * any non-fastify code path (intent parser, runner callbacks, etc.) so logs
 * actually reach CloudWatch instead of being dropped to bare stdout.
 */
export function getLogger(): Logger {
  if (!cachedLogger) {
    cachedLogger = pino(
      { level: 'info', base: { service: 'deck-forge-runtime' } },
      pino.transport(buildTransport()),
    );
  }
  return cachedLogger;
}
