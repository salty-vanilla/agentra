import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WelcomePromptCards } from '@/components/welcome-prompt-cards';

describe('WelcomePromptCards', () => {
  it('renders 6 cards', () => {
    render(<WelcomePromptCards onSelect={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(6);
  });

  it('calls onSelect with the card prompt on click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<WelcomePromptCards onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /業界トレンド調査/ }));

    expect(onSelect).toHaveBeenCalledWith(
      '生成AIを活用したビジネス変革の最新トレンドを調査し、日本企業への示唆をまとめてください',
    );
  });

  it('passes /slide prompt unchanged', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<WelcomePromptCards onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /提案資料作成/ }));

    expect(onSelect).toHaveBeenCalledWith('/slide 生成AIを活用した業務効率化の提案');
  });
});
