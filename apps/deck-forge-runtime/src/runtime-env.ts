import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';

function resolveAwsRegion(): string {
  return process.env.AWS_REGION ?? process.env.BEDROCK_REGION ?? 'us-east-1';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveSecretString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (isRecord(value)) {
    const nested = value.PEXELS_API_KEY;
    if (typeof nested === 'string' && nested.trim()) {
      return nested.trim();
    }
  }

  return null;
}

async function getPexelsApiKeyFromSecretsManager(secretId: string): Promise<string> {
  const client = new SecretsManagerClient({ region: resolveAwsRegion() });
  const response = await client.send(new GetSecretValueCommand({ SecretId: secretId }));

  if (response.SecretString) {
    const raw = response.SecretString;

    try {
      const parsed: unknown = JSON.parse(raw);
      const fromJson = resolveSecretString(parsed);
      if (fromJson) {
        return fromJson;
      }
    } catch {
      const plain = resolveSecretString(raw);
      if (plain) {
        return plain;
      }
    }
  }

  if (response.SecretBinary) {
    const binary = Buffer.from(response.SecretBinary).toString('utf8');

    try {
      const parsed: unknown = JSON.parse(binary);
      const fromJson = resolveSecretString(parsed);
      if (fromJson) {
        return fromJson;
      }
    } catch {
      const plain = resolveSecretString(binary);
      if (plain) {
        return plain;
      }
    }
  }

  throw new Error(
    'Secrets Manager value is empty. Expected plain API key or JSON with PEXELS_API_KEY.',
  );
}

export async function bootstrapDeckForgeRuntimeEnv(): Promise<void> {
  if (!process.env.PEXELS_API_KEY?.trim()) {
    const secretId = process.env.PEXELS_API_KEY_SECRET_ID?.trim();
    if (secretId) {
      process.env.PEXELS_API_KEY = await getPexelsApiKeyFromSecretsManager(secretId);
    }
  }

  process.env.AWS_REGION ??= process.env.BEDROCK_REGION ?? 'us-east-1';
  process.env.DECK_FORGE_BEDROCK_TEXT_MODEL_ID ??= 'global.anthropic.claude-sonnet-4-6';
}
