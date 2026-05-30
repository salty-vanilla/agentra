import type { ColumnDef } from '@tanstack/react-table';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from '@/components/ui/data-table';

type Row = { id: string; name: string; count: number };

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'count', header: 'Count' },
];

const columnsWithNonSortable: ColumnDef<Row>[] = [
  { accessorKey: 'id', header: 'ID' },
  { accessorKey: 'name', header: 'Name', enableSorting: false },
  { accessorKey: 'count', header: 'Count' },
];

const data: Row[] = [
  { id: '1', name: 'Alice', count: 5 },
  { id: '2', name: 'Bob', count: 3 },
];

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable data={data} columns={columns} />);
    expect(screen.getByText('ID')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Count')).toBeInTheDocument();
  });

  it('renders all row data', () => {
    render(<DataTable data={data} columns={columns} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('clicking a sortable header sets aria-sort to ascending, then descending', async () => {
    const user = userEvent.setup();
    render(<DataTable data={data} columns={columns} />);

    const idHeader = screen.getByRole('columnheader', { name: /^ID/i });
    expect(idHeader).toHaveAttribute('aria-sort', 'none');

    await user.click(screen.getByRole('button', { name: /^ID/i }));
    expect(idHeader).toHaveAttribute('aria-sort', 'ascending');

    await user.click(screen.getByRole('button', { name: /^ID/i }));
    expect(idHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('sort icon changes with sort state', async () => {
    const user = userEvent.setup();
    const { container } = render(<DataTable data={data} columns={columns} />);

    const idBtn = screen.getByRole('button', { name: /^ID/i });

    // Before sorting: ChevronsUpDown (has two chevron SVGs)
    expect(container.querySelectorAll('svg').length).toBeGreaterThan(0);

    await user.click(idBtn);
    // After ascending: ChevronUp icon present
    const idHeader = screen.getByRole('columnheader', { name: /^ID/i });
    expect(idHeader).toHaveAttribute('aria-sort', 'ascending');
  });

  it('non-sortable column has no sort button and no aria-sort', () => {
    render(<DataTable data={data} columns={columnsWithNonSortable} />);

    const nameHeader = screen.getByRole('columnheader', { name: 'Name' });
    expect(nameHeader).not.toHaveAttribute('aria-sort');

    // All buttons are only for sortable columns
    const buttons = screen.getAllByRole('button');
    const buttonTexts = buttons.map((b) => b.textContent ?? '');
    expect(buttonTexts.some((t) => t.includes('Name'))).toBe(false);
  });

  it('shows emptyMessage when data is empty', () => {
    render(<DataTable data={[]} columns={columns} emptyMessage="Nothing here." />);
    expect(screen.getByText('Nothing here.')).toBeInTheDocument();
  });

  it('shows default empty message when data is empty and no emptyMessage prop', () => {
    render(<DataTable data={[]} columns={columns} />);
    expect(screen.getByText('この期間のデータはありません。')).toBeInTheDocument();
  });

  it('shows loading message when isLoading=true and data is empty', () => {
    render(<DataTable data={[]} columns={columns} isLoading />);
    expect(screen.getByText('読み込み中...')).toBeInTheDocument();
  });

  it('shows error message when error is set and data is empty', () => {
    render(<DataTable data={[]} columns={columns} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('calls onRowClick with correct row data when a row is clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<DataTable data={data} columns={columns} onRowClick={handleClick} />);

    await user.click(screen.getByText('Alice'));
    expect(handleClick).toHaveBeenCalledTimes(1);
    expect(handleClick).toHaveBeenCalledWith({ id: '1', name: 'Alice', count: 5 });
  });

  it('rows are not cursor-pointer when onRowClick is not provided', () => {
    const { container } = render(<DataTable data={data} columns={columns} />);
    const rows = container.querySelectorAll('tbody tr');
    for (const row of rows) {
      expect(row.className).not.toContain('cursor-pointer');
    }
  });

  it('resets sorting when resetSortingKey changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <DataTable data={data} columns={columns} resetSortingKey="period-a" />,
    );

    await user.click(screen.getByRole('button', { name: /^ID/i }));
    expect(screen.getByRole('columnheader', { name: /^ID/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );

    rerender(<DataTable data={data} columns={columns} resetSortingKey="period-b" />);
    expect(screen.getByRole('columnheader', { name: /^ID/i })).toHaveAttribute(
      'aria-sort',
      'none',
    );
  });

  it('does not show loading message when data is present even with isLoading=true', () => {
    render(<DataTable data={data} columns={columns} isLoading />);
    expect(screen.queryByText('読み込み中...')).not.toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('sets a table min-width from column sizes so narrow containers can scroll', () => {
    const sizedColumns: ColumnDef<Row>[] = [
      { accessorKey: 'id', header: 'ID', size: 120 },
      { accessorKey: 'name', header: 'Name', size: 220 },
      { accessorKey: 'count', header: 'Count', size: 90 },
    ];

    const { container } = render(<DataTable data={data} columns={sizedColumns} />);
    expect(container.querySelector('table')).toHaveStyle({ minWidth: '430px' });
  });

  it('sets the same column-size min-width for virtualized tables', () => {
    const sizedColumns: ColumnDef<Row>[] = [
      { accessorKey: 'id', header: 'ID', size: 120 },
      { accessorKey: 'name', header: 'Name', size: 220 },
      { accessorKey: 'count', header: 'Count', size: 90 },
    ];

    const { container } = render(
      <DataTable data={data} columns={sizedColumns} virtualized height={120} />,
    );
    expect(container.querySelector('table')).toHaveStyle({ minWidth: '430px' });
  });
});
