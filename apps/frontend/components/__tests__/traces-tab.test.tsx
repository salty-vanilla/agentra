import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TracesTab } from '@/components/admin/traces-tab';

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return { ...actual, useQuery: vi.fn() };
});

vi.mock('@/components/ui/data-table', () => ({
  DataTable: ({
    data,
    onRowClick,
    emptyMessage,
  }: {
    data: Record<string, unknown>[];
    onRowClick?: (row: Record<string, unknown>) => void;
    emptyMessage?: string;
  }) => (
    <div data-testid="data-table">
      {data.length === 0 ? (
        <span>{emptyMessage ?? 'No data for this period.'}</span>
      ) : (
        data.map((row, i) => (
          <button key={i} type="button" onClick={() => onRowClick?.(row)}>
            {String(row.traceId)}
          </button>
        ))
      )}
    </div>
  ),
}));

const traceAlpha = {
  traceId: 'trace-alpha-0000-0000-0000-000000000001',
  userId: 'user-alice-0000-0000-0000-000000000001',
  startedAt: '2026-05-25T10:00:00Z',
  completedAt: '2026-05-25T10:00:01Z',
  durationMs: 1000,
  status: 'success',
  totalTokens: 500,
  toolCallCount: 2,
  agentCallCount: 1,
  skillCallCount: 0,
};

const traceBeta = {
  traceId: 'trace-beta-0000-0000-0000-000000000002',
  userId: 'user-bob-0000-0000-0000-000000000002',
  startedAt: '2026-05-25T11:00:00Z',
  completedAt: '2026-05-25T11:00:02Z',
  durationMs: 2000,
  status: 'error',
  totalTokens: 300,
  toolCallCount: 1,
  agentCallCount: 0,
  skillCallCount: 1,
};

function setup(onSelectTrace = vi.fn()) {
  vi.mocked(useQuery).mockReturnValue({
    data: { traces: [traceAlpha, traceBeta] },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useQuery>);

  return {
    result: render(
      <TracesTab from="2026-05-01" to="2026-05-25" onSelectTrace={onSelectTrace} />,
    ),
    onSelectTrace,
  };
}

describe('TracesTab', () => {
  it('renders all traces when search is empty', () => {
    setup();
    expect(screen.getByText(traceAlpha.traceId)).toBeInTheDocument();
    expect(screen.getByText(traceBeta.traceId)).toBeInTheDocument();
  });

  it('filters loaded rows by trace ID using the SearchToolbar', async () => {
    const user = userEvent.setup();
    setup();
    // The SearchToolbar input has placeholder "Filter loaded rows..."
    await user.type(screen.getByPlaceholderText('Filter loaded rows...'), 'alpha');
    expect(screen.getByText(traceAlpha.traceId)).toBeInTheDocument();
    expect(screen.queryByText(traceBeta.traceId)).not.toBeInTheDocument();
  });

  it('filters loaded rows by user ID using the SearchToolbar', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText('Filter loaded rows...'), 'bob');
    expect(screen.queryByText(traceAlpha.traceId)).not.toBeInTheDocument();
    expect(screen.getByText(traceBeta.traceId)).toBeInTheDocument();
  });

  it('restores all rows when SearchToolbar is cleared', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText('Filter loaded rows...'), 'alpha');
    await user.click(screen.getByRole('button', { name: /clear search/i }));
    expect(screen.getByText(traceAlpha.traceId)).toBeInTheDocument();
    expect(screen.getByText(traceBeta.traceId)).toBeInTheDocument();
  });

  it('shows empty state when no traces match the search', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByPlaceholderText('Filter loaded rows...'), 'zzznomatch');
    expect(screen.getByText('No traces match the search.')).toBeInTheDocument();
  });

  it('calls onSelectTrace with traceId when a row is clicked', async () => {
    const user = userEvent.setup();
    const { onSelectTrace } = setup();
    await user.click(screen.getByText(traceAlpha.traceId));
    expect(onSelectTrace).toHaveBeenCalledWith(traceAlpha.traceId);
  });

  it('renders the existing status filter select', () => {
    setup();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders the Apply button for server-side userId filter', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument();
  });
});
