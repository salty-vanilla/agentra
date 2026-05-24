import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProgressSummaryEvent } from '@/lib/generated/model';
import { ProgressSummaryCard } from '../progress-summary-card';

const makeEvent = (
  phase: ProgressSummaryEvent['phase'],
  title: string,
  summary: string,
  details?: string[],
): ProgressSummaryEvent => ({
  type: 'progress_summary',
  phase,
  title,
  summary,
  ...(details !== undefined ? { details } : {}),
  timestamp: '2026-01-01T00:00:00.000Z',
});

describe('ProgressSummaryCard', () => {
  it('renders nothing when events array is empty', () => {
    const { container } = render(<ProgressSummaryCard events={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders event titles and summaries', () => {
    const events = [
      makeEvent('request_understanding', 'リクエスト解析', '解析中'),
      makeEvent('outline', 'アウトライン', '構成完了'),
    ];
    render(<ProgressSummaryCard events={events} />);

    expect(screen.getByText('リクエスト解析')).toBeInTheDocument();
    expect(screen.getByText('解析中')).toBeInTheDocument();
    expect(screen.getByText('アウトライン')).toBeInTheDocument();
    expect(screen.getByText('構成完了')).toBeInTheDocument();
  });

  it('shows error heading when an error event is present', () => {
    const events = [
      makeEvent('request_understanding', 'リクエスト解析', '解析完了'),
      makeEvent('error', 'エラー', '処理に失敗しました'),
    ];
    render(<ProgressSummaryCard events={events} />);

    expect(screen.getByText('スライド作成に失敗しました')).toBeInTheDocument();
  });

  it('shows in-progress heading when no error event is present', () => {
    const events = [makeEvent('outline', 'アウトライン作成', '構成作成中')];
    render(<ProgressSummaryCard events={events} />);

    expect(screen.getByText('スライド作成中')).toBeInTheDocument();
  });

  it('renders optional details as a list', () => {
    const events = [
      makeEvent('request_understanding', 'リクエスト解析', '解析完了', [
        '5スライド',
        'Tech向け',
      ]),
    ];
    render(<ProgressSummaryCard events={events} />);

    expect(screen.getByText('5スライド')).toBeInTheDocument();
    expect(screen.getByText('Tech向け')).toBeInTheDocument();
  });
});
