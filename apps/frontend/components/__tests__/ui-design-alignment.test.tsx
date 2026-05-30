import type { ColumnDef } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { DataTable } from '@/components/ui/data-table';

type Row = { id: string; count: number };

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'count', header: 'Count' },
];

describe('core UI design alignment', () => {
  it('renders badges with restrained radius and subtle semantic state color', () => {
    render(<Badge variant="success">success</Badge>);

    const badge = screen.getByText('success');
    expect(badge).toHaveClass('rounded-md');
    expect(badge).toHaveClass('bg-green-600/10');
    expect(badge).not.toHaveClass('rounded-full');
    expect(badge).not.toHaveClass('rounded-4xl');
  });

  it('keeps cards neutral and border-led', () => {
    const { container } = render(<Card>Neutral card</Card>);
    const card = container.firstElementChild;

    expect(card).toHaveClass('rounded-lg');
    expect(card).toHaveClass('border');
    expect(card).toHaveClass('bg-card');
    expect(card?.className).not.toContain('shadow');
  });

  it('renders tables as dense, tabular, neutral surfaces', () => {
    const { container } = render(
      <DataTable data={[{ id: 'alpha', count: 42 }]} columns={columns} />,
    );
    const shell = container.firstElementChild;

    expect(shell).toHaveClass('rounded-lg');
    expect(shell).toHaveClass('bg-card');
    expect(shell).toHaveClass('tabular-nums');
    expect(screen.getByRole('columnheader', { name: /^Count/i })).toHaveClass('py-1.5');
  });
});
