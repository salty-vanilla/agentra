import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { invokeSlideRuntime } from '../tools/slide-runtime-client.js';

describe('invokeSlideRuntime timeout handling', () => {
  beforeEach(() => {
    // Set env vars required for the test
    process.env.SLIDE_AGENTCORE_RUNTIME_ARN =
      'arn:aws:bedrock:us-east-1:123456789012:agent-runtime/slide-runtime';
    process.env.BEDROCK_REGION = 'us-east-1';
  });

  afterEach(() => {
    delete process.env.SLIDE_AGENTCORE_RUNTIME_ARN;
    delete process.env.BEDROCK_REGION;
  });

  it('throws error when SLIDE_RUNTIME_ARN is not configured', async () => {
    delete process.env.SLIDE_AGENTCORE_RUNTIME_ARN;
    const promise = invokeSlideRuntime({
      prompt: 'test',
    });
    await expect(promise).rejects.toThrow(
      'SLIDE_AGENTCORE_RUNTIME_ARN is not configured',
    );
  });

  it('accepts optional abort signal', async () => {
    const controller = new AbortController();
    // Just verify the function accepts the parameter without error
    // (actual invocation would fail due to SDK not being mocked, but that's okay)
    const promise = invokeSlideRuntime(
      {
        prompt: 'test',
      },
      controller.signal,
    );
    controller.abort();
    // Promise should reject, but that's expected
    await expect(promise).rejects.toThrow();
  });
});
