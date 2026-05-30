import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent, within } from 'storybook/test';
import { storybookUsersHandler } from '@/mocks/handlers/storybook-handlers';
import { UsersTab } from './users-tab';

const meta = {
  title: 'Admin/UsersTab',
  component: UsersTab,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    msw: { handlers: [storybookUsersHandler] },
  },
  args: {
    from: '2026-05-01',
    to: '2026-05-26',
  },
  decorators: [
    (Story) => (
      <div style={{ height: '600px', display: 'flex', flexDirection: 'column' }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UsersTab>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithRoles: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Shows active users from the selected period with role badges, right-aligned numeric columns, and warning/destructive error-rate text tiers. Users without a role field default to User.',
      },
    },
  },
};

export const Loading: Story = {
  parameters: {
    msw: {
      handlers: [
        // Intentionally no handler — let request hang to show loading state
      ],
    },
  },
};

export const SearchAndClear: Story = {
  name: 'Search → clear resets filter',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByPlaceholderText(/Search by user ID/);
    await userEvent.type(input, 'admin');
    const clearButton = await canvas.findByLabelText('Clear search');
    await userEvent.click(clearButton);
    expect(input).toHaveValue('');
  },
};
