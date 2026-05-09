import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('bedrock structured poc diagnostics tool', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('returns diagnostics output without leaking env values by default', async () => {
    vi.stubEnv('BEDROCK_KB_STRUCTURED_MODE', 'stub');
    vi.stubEnv('BEDROCK_KB_STRUCTURED_REGION', 'us-east-1');

    const { executeBedrockStructuredPocDiagnosticsTool } = await import(
      '../../tools/bedrock-structured-poc-diagnostics.tool.js'
    );

    const response = await executeBedrockStructuredPocDiagnosticsTool({
      runMockFlow: true,
    });

    expect(response.status).toBe('success');

    const payload = JSON.parse(response.content[0]?.text ?? '{}');
    expect(payload).toMatchObject({
      status: 'warn',
      metadata: {
        diagnostics: 'bedrock-structured-poc-diagnostics-v1',
        mode: 'stub',
        liveEnabled: false,
      },
    });
    expect(payload.metadata).not.toHaveProperty('config');
    expect(payload.checks.some((check: { id: string }) => check.id === 'mock_flow')).toBe(
      true,
    );
  });

  it('rejects oversized metadata maps', async () => {
    const { executeBedrockStructuredPocDiagnosticsTool } = await import(
      '../../tools/bedrock-structured-poc-diagnostics.tool.js'
    );

    const metadata: Record<string, unknown> = {};
    for (let index = 0; index < 101; index += 1) {
      metadata[`key-${index}`] = index;
    }

    const response = await executeBedrockStructuredPocDiagnosticsTool({
      metadata,
    });

    expect(response.status).toBe('error');
    expect(response.content[0]?.text).toContain('metadata must not exceed 100 keys');
  });
});
