import { TooltipProvider } from '@radix-ui/react-tooltip';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ComposerShellView } from '../assistant-ui/composer-shell-view';

const defaultProps = {
  modelValue: 'sonnet' as const,
  onModelChange: () => {},
  inputSlot: <textarea aria-label="input" />,
  actionSlot: <button type="button">Send</button>,
};

function renderShell(
  props: Partial<React.ComponentProps<typeof ComposerShellView>> = {},
) {
  return render(
    <TooltipProvider>
      <ComposerShellView {...defaultProps} {...props} />
    </TooltipProvider>,
  );
}

describe('ComposerShellView', () => {
  it('renders the shell container', () => {
    const { container } = renderShell();
    expect(
      container.querySelector('[data-slot="aui_composer-shell"]'),
    ).toBeInTheDocument();
  });

  it('renders the provided inputSlot', () => {
    renderShell();
    expect(screen.getByRole('textbox', { name: 'input' })).toBeInTheDocument();
  });

  it('renders the provided actionSlot', () => {
    renderShell();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('does not show SlideCommandBadge when both flags are false', () => {
    renderShell({ slideCommandActive: false, hasSlidePrefix: false });
    expect(screen.queryByText('スライド作成')).toBeNull();
  });

  it('shows SlideCommandBadge when slideCommandActive is true', () => {
    renderShell({ slideCommandActive: true });
    expect(screen.getByText('スライド作成')).toBeInTheDocument();
  });

  it('shows SlideCommandBadge when hasSlidePrefix is true', () => {
    renderShell({ hasSlidePrefix: true });
    expect(screen.getByText('スライド作成')).toBeInTheDocument();
  });

  it('calls onSlideCommandDeactivate when badge remove button is clicked', async () => {
    const onSlideCommandDeactivate = vi.fn();
    renderShell({ slideCommandActive: true, onSlideCommandDeactivate });
    await userEvent.click(screen.getByRole('button', { name: 'コマンドを削除' }));
    expect(onSlideCommandDeactivate).toHaveBeenCalledOnce();
  });

  it('does not show remove button on badge when onSlideCommandDeactivate is absent', () => {
    renderShell({ slideCommandActive: true });
    expect(screen.queryByRole('button', { name: 'コマンドを削除' })).toBeNull();
  });

  it('does not render ModelSelector when showModelSelector is false', () => {
    renderShell({ showModelSelector: false });
    expect(screen.queryByRole('button', { name: 'モデルを選択' })).toBeNull();
  });

  it('renders ModelSelector when showModelSelector is true', () => {
    renderShell({ showModelSelector: true });
    expect(screen.getByRole('button', { name: 'モデルを選択' })).toBeInTheDocument();
  });
});
