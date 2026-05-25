import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ToolsTab } from '@/components/admin/tools-tab';

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
            {String(row.toolName)}
          </button>
        ))
      )}
    </div>
  ),
}));

const webSearch = {
  toolName: 'web_search',
  callCount: 20,
  failureRate: 0.05,
  avgDurationMs: 200,
  lastError: undefined,
};

const runCode = {
  toolName: 'run_code',
  callCount: 8,
  failureRate: 0.25,
  avgDurationMs: 1500,
  lastError: 'Timeout exceeded',
};

function setup() {
  vi.mocked(useQuery).mockReturnValue({
    data: { tools: [webSearch, runCode] },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useQuery>);

  return render(<ToolsTab from="2026-05-01" to="2026-05-25" />);
}

describe('ToolsTab', () => {
  it('renders all tools when search is empty', () => {
    setup();
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.getByText('run_code')).toBeInTheDocument();
  });

  it('filters rows by tool name', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'web');
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.queryByText('run_code')).not.toBeInTheDocument();
  });

  it('restores all rows after clearing the search', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'web');
    await user.click(screen.getByRole('button', { name: /clear search/i }));
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.getByText('run_code')).toBeInTheDocument();
  });

  it('shows empty state when no rows match', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'zzznomatch');
    expect(screen.getByText('No tools match the search.')).toBeInTheDocument();
  });

  it('opens ToolDetailDrawer when a row is clicked', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText('web_search'));
    expect(screen.getByText('Tool Detail')).toBeInTheDocument();
  });
});
