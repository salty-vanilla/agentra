import { describe, expect, it, vi } from 'vitest';
import { ObservationCollector } from '../observability.js';

describe('observability collector', () => {
  it('preserves tool call ids from the stream into the final summary', () => {
    const collector = new ObservationCollector(
      'trace-123',
      '2026-05-07T00:00:00.000Z',
      false,
    );

    collector.onContentToolUseBlock('tool-use-123', 'search_web');
    collector.onToolResult('tool-use-123', 'success', { ok: true });

    const snapshot = collector.createSnapshot('success', '2026-05-07T00:00:05.000Z');

    expect(snapshot.toolCalls).toHaveLength(1);
    expect(snapshot.toolCalls[0]).toMatchObject({
      toolCallId: 'tool-use-123',
      toolName: 'search_web',
      status: 'success',
    });
  });

  it('captures standardized handoff metadata from structured tool results', () => {
    const collector = new ObservationCollector(
      'trace-456',
      '2026-05-07T00:00:00.000Z',
      false,
    );

    collector.onContentToolUseBlock('tool-use-456', 'invoke_web_research_agent');
    collector.onToolResult('tool-use-456', 'success', [
      {
        text: JSON.stringify({
          status: 'success',
          agentKind: 'web_research',
          agentName: 'Web Research Agent',
          handoffMode: 'standard',
          answer: 'Result',
          metadata: {
            parentAgent: 'router-agent',
            childAgent: 'web-research-agent',
            handoffTool: 'invoke_web_research_agent',
            threadId: 'thread-1',
          },
        }),
      },
    ]);

    const snapshot = collector.createSnapshot('success', '2026-05-07T00:00:05.000Z');

    expect(snapshot.toolCalls[0]).toMatchObject({
      toolCallId: 'tool-use-456',
      toolName: 'invoke_web_research_agent',
      status: 'success',
      metadata: {
        status: 'success',
        agentKind: 'web_research',
        agentName: 'Web Research Agent',
        handoffMode: 'standard',
        parentAgent: 'router-agent',
        childAgent: 'web-research-agent',
        handoffTool: 'invoke_web_research_agent',
        threadId: 'thread-1',
      },
    });
  });

  it('logs error summary to console with structured format', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    const collector = new ObservationCollector(
      'trace-789',
      '2026-05-07T00:00:00.000Z',
      false,
    );

    const errorSummary = collector.createSnapshot('error', '2026-05-07T00:00:05.000Z');
    collector.logErrorSummary(errorSummary);

    expect(consoleInfoSpy).toHaveBeenCalledOnce();
    const logCall = consoleInfoSpy.mock.calls[0][0];
    const parsed = JSON.parse(logCall as string);

    expect(parsed).toMatchObject({
      level: 'error',
      message: 'invocation_error_summary',
      traceId: 'trace-789',
      observationSummary: {
        status: 'error',
        traceId: 'trace-789',
      },
    });
    expect(parsed.timestamp).toBeDefined();

    consoleInfoSpy.mockRestore();
  });
});
