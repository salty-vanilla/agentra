import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

function renderToggle() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe('ThemeToggle', () => {
  it('renders an accessible trigger for switching theme', () => {
    renderToggle();

    expect(
      screen.getByRole('button', { name: 'テーマを切り替える' }),
    ).toBeInTheDocument();
  });

  it('exposes Light, Dark, and System options when opened', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: 'テーマを切り替える' }));

    expect(
      await screen.findByRole('menuitemradio', { name: 'Light' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'Dark' })).toBeInTheDocument();
    expect(screen.getByRole('menuitemradio', { name: 'System' })).toBeInTheDocument();
  });

  it('applies the dark class to <html> when Dark is selected', async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole('button', { name: 'テーマを切り替える' }));
    await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }));

    expect(document.documentElement).toHaveClass('dark');
  });
});
