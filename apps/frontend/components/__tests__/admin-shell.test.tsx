import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminShell } from '@/components/admin/admin-shell';
import { AdminSidebarShell, AdminSidebarView } from '@/components/admin/admin-sidebar';
import { renderWithProviders } from '@/test/render-with-providers';

describe('admin responsive shell', () => {
  afterEach(() => {
    setViewportWidth(1024);
  });

  function setViewportWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: width,
    });
  }

  it('keeps the standalone AdminSidebarView renderable for Storybook stories', () => {
    render(<AdminSidebarView currentPath="/admin/users" />);

    expect(screen.getByRole('link', { name: 'Admin Console' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Users/ })).toBeInTheDocument();
  });

  it('renders a labelled mobile navigation trigger inside the admin shell', () => {
    renderWithProviders(
      <AdminShell sidebar={<AdminSidebarShell currentPath="/admin/users" />}>
        <div>Admin content</div>
      </AdminShell>,
    );

    expect(
      screen.getByRole('button', { name: 'Open admin navigation' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Admin content')).toBeInTheDocument();
  });

  it('opens the admin sidebar in a sheet at mobile width', async () => {
    const user = userEvent.setup();
    setViewportWidth(390);

    renderWithProviders(
      <AdminShell sidebar={<AdminSidebarShell currentPath="/admin/users" />}>
        <div>Admin content</div>
      </AdminShell>,
    );

    await waitFor(() =>
      expect(document.querySelector('[data-slot="sidebar"]')).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Open admin navigation' }));

    expect(await screen.findByRole('dialog', { name: 'Sidebar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Users/ })).toBeInTheDocument();
  });
});
