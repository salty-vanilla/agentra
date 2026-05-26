import { useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SkillsTab } from '@/components/admin/skills-tab';

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
            {String(row.skillName)}
          </button>
        ))
      )}
    </div>
  ),
}));

const webSearchSkill = {
  skillName: 'web_search',
  requestCount: 15,
  avgDurationMs: 300,
  totalTokens: 2000,
  errorRate: 0.05,
};

const slideGen = {
  skillName: 'slide_generation',
  requestCount: 4,
  avgDurationMs: 5000,
  totalTokens: 8000,
  errorRate: 0.1,
};

function setup() {
  vi.mocked(useQuery).mockReturnValue({
    data: { skills: [webSearchSkill, slideGen] },
    isLoading: false,
    error: null,
  } as ReturnType<typeof useQuery>);

  return render(<SkillsTab from="2026-05-01" to="2026-05-25" />);
}

describe('SkillsTab', () => {
  it('renders all skills when search is empty', () => {
    setup();
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.getByText('slide_generation')).toBeInTheDocument();
  });

  it('filters rows by skill name', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'web');
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.queryByText('slide_generation')).not.toBeInTheDocument();
  });

  it('restores all rows after clearing the search', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'web');
    await user.click(screen.getByRole('button', { name: /clear search/i }));
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.getByText('slide_generation')).toBeInTheDocument();
  });

  it('shows empty state when no rows match', async () => {
    const user = userEvent.setup();
    setup();
    await user.type(screen.getByRole('textbox'), 'zzznomatch');
    expect(screen.getByText('No skills match the search.')).toBeInTheDocument();
  });

  it('opens SkillDetailDrawer when a row is clicked', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByText('web_search'));
    expect(screen.getByText('Skill Detail')).toBeInTheDocument();
  });
});
