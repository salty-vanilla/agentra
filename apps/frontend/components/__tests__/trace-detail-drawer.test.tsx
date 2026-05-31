import { useQuery } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TraceDetailDrawer } from '@/components/admin/trace-detail-drawer';
import { renderWithProviders } from '@/test/render-with-providers';

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: vi.fn() };
});

const BASE_TIME = '2026-05-25T10:00:00.000Z';
const TOOL_TIME = '2026-05-25T10:00:00.085Z'; // +85ms

const mockDetail = {
  traceId: 'trace-abc-0000-0000-0000-000000000001',
  userId: 'user-xyz-0000-0000-0000-000000000002',
  requestId: 'req-000-0000-0000-0000-000000000003',
  threadId: 'thread-00-0000-0000-0000-000000000004',
  startedAt: BASE_TIME,
  completedAt: '2026-05-25T10:00:02.000Z',
  durationMs: 2000,
  status: 'success' as const,
  model: 'claude-sonnet-4-6',
  totalTokens: 1500,
  estimatedCostUsd: 0.00123,
  tokenUsage: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
  toolCalls: [
    {
      toolCallId: 'tc-1',
      toolName: 'web_search',
      startedAt: TOOL_TIME,
      completedAt: '2026-05-25T10:00:00.285Z',
      durationMs: 200,
      status: 'success' as const,
      error: undefined,
    },
  ],
  agentCalls: [],
  skillCalls: [],
};

const mockWriteText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  mockWriteText.mockClear();
  vi.stubGlobal('navigator', { clipboard: { writeText: mockWriteText } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(traceId: string | null = 'trace-abc') {
  vi.mocked(useQuery).mockReturnValue({
    data: { trace: mockDetail },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useQuery>);

  return renderWithProviders(<TraceDetailDrawer traceId={traceId} onClose={vi.fn()} />);
}

describe('TraceDetailDrawer', () => {
  describe('click-to-copy', () => {
    it('copies Trace ID when the copy button is clicked', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: /Trace IDをコピー/ }));
      expect(mockWriteText).toHaveBeenCalledWith(mockDetail.traceId);
    });

    it('copies User ID when the copy button is clicked', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: /User IDをコピー/ }));
      expect(mockWriteText).toHaveBeenCalledWith(mockDetail.userId);
    });

    it('copies Request ID when the copy button is clicked', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: /Request IDをコピー/ }));
      expect(mockWriteText).toHaveBeenCalledWith(mockDetail.requestId);
    });

    it('copies Thread ID when the copy button is clicked', () => {
      setup();
      fireEvent.click(screen.getByRole('button', { name: /Thread IDをコピー/ }));
      expect(mockWriteText).toHaveBeenCalledWith(mockDetail.threadId);
    });
  });

  describe('relative timestamps', () => {
    it('shows +85ms relative timestamp for the tool call', () => {
      setup();
      expect(screen.getByText('+85ms')).toBeInTheDocument();
    });
  });

  describe('error display', () => {
    it('renders long error text without truncation class', () => {
      vi.mocked(useQuery).mockReturnValue({
        data: {
          trace: {
            ...mockDetail,
            toolCalls: [
              {
                ...mockDetail.toolCalls[0],
                status: 'error' as const,
                error:
                  'This is a very long error message that should not be truncated in the drawer because we removed the truncate CSS class from the error display element.',
              },
            ],
          },
        },
        isLoading: false,
        error: null,
      } as ReturnType<typeof useQuery>);

      render(<TraceDetailDrawer traceId="trace-abc" onClose={vi.fn()} />);
      expect(
        screen.getByText(
          'This is a very long error message that should not be truncated in the drawer because we removed the truncate CSS class from the error display element.',
        ),
      ).toBeInTheDocument();
    });
  });

  describe('drawer open/close', () => {
    it('does not render content when traceId is null', () => {
      setup(null);
      expect(screen.queryByText('トレース詳細')).not.toBeInTheDocument();
    });

    it('renders trace details when traceId is set', () => {
      setup();
      expect(screen.getByText('トレース詳細')).toBeInTheDocument();
      expect(screen.getByText(mockDetail.traceId)).toBeInTheDocument();
    });
  });
});
