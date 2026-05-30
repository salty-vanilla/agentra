import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from './data-table';

type Row = { id: string; name: string; value: number; category: string };

const columns: ColumnDef<Row>[] = [
  { accessorKey: 'id', header: 'ID', size: 80 },
  { accessorKey: 'name', header: 'Name', size: 200 },
  { accessorKey: 'value', header: 'Value', size: 100, meta: { align: 'right' } },
  {
    accessorKey: 'category',
    header: 'Category',
    size: 150,
    enableSorting: false,
  },
];

function makeRow(i: number): Row {
  const categories = ['Alpha', 'Beta', 'Gamma', 'Delta'];
  return {
    id: String(i + 1).padStart(4, '0'),
    name: `Item ${i + 1}`,
    value: Math.floor((i * 37 + 7) % 1000),
    category: categories[i % categories.length] as string,
  };
}

const smallData: Row[] = Array.from({ length: 5 }, (_, i) => makeRow(i));
const largeData: Row[] = Array.from({ length: 500 }, (_, i) => makeRow(i));

const meta: Meta<typeof DataTable<Row>> = {
  title: 'UI/DataTable',
  component: DataTable,
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj<typeof DataTable<Row>>;

export const Default: Story = {
  args: {
    data: smallData,
    columns,
  },
};

export const WithSorting: Story = {
  args: {
    data: smallData,
    columns,
  },
  parameters: {
    docs: {
      description: {
        story: 'Click ID, Name, or Value headers to sort. Category has sorting disabled.',
      },
    },
  },
};

export const WithVirtualization: Story = {
  args: {
    data: largeData,
    columns,
    virtualized: true,
    height: 400,
    estimatedRowHeight: 37,
  },
  parameters: {
    docs: {
      description: {
        story:
          '500 rows rendered with TanStack Virtual. Only visible rows are in the DOM.',
      },
    },
  },
};

export const Empty: Story = {
  args: {
    data: [],
    columns,
    emptyMessage: 'No items found.',
  },
};

export const Loading: Story = {
  args: {
    data: [],
    columns,
    isLoading: true,
  },
};

export const ErrorState: Story = {
  args: {
    data: [],
    columns,
    error: 'Failed to load data. Please try again.',
  },
};

export const ClickableRows: Story = {
  args: {
    data: smallData,
    columns,
    onRowClick: (row: Row) => alert(`Clicked: ${row.name}`),
  },
  parameters: {
    docs: {
      description: {
        story: 'Rows show cursor-pointer on hover and fire the onRowClick callback.',
      },
    },
  },
};
