import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtifactCard } from './artifact-card';

const THREAD_ID = 'thread-demo-001';

const meta = {
  title: 'Components/ArtifactCard',
  component: ArtifactCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  args: {
    threadId: THREAD_ID,
    getDownloadUrl: async (_tid, _aid) => ({
      url: 'data:application/octet-stream;base64,',
    }),
  },
} satisfies Meta<typeof ArtifactCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    artifact: {
      id: 'art-001',
      kind: 'pptx',
      name: '営業戦略提案_2026Q2.pptx',
      path: 'runs/run-001/output.pptx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      sizeBytes: 2_450_000,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const LargeFile: Story = {
  args: {
    artifact: {
      id: 'art-002',
      kind: 'pptx',
      name: '全社経営報告_年次レビュー_詳細版.pptx',
      path: 'runs/run-002/output.pptx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      sizeBytes: 157_286_400,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const WithoutSize: Story = {
  args: {
    artifact: {
      id: 'art-003',
      kind: 'pdf',
      name: 'プロジェクト概要書.pdf',
      path: 'runs/run-003/output.pdf',
      mimeType: 'application/pdf',
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const NoPath: Story = {
  args: {
    artifact: {
      id: 'art-004',
      kind: 'pptx',
      name: 'パスなしのファイル.pptx',
      sizeBytes: 1_024_000,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const ExistsFalse: Story = {
  args: {
    artifact: {
      id: 'art-005',
      kind: 'pptx',
      name: '削除済みファイル.pptx',
      path: 'runs/run-005/output.pptx',
      exists: false,
      sizeBytes: 1_024_000,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const LongFileName: Story = {
  args: {
    artifact: {
      id: 'art-006',
      kind: 'pptx',
      name: '非常に長いファイル名のサンプル_プロジェクトABC_フェーズ2_最終確認版_レビュー済み_2026年5月.pptx',
      path: 'runs/run-006/output.pptx',
      sizeBytes: 3_145_728,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const MobileWidth: Story = {
  decorators: [
    (Story) => (
      <div style={{ width: '320px' }}>
        <Story />
      </div>
    ),
  ],
  args: {
    artifact: {
      id: 'art-007',
      kind: 'pptx',
      name: 'モバイル表示確認.pptx',
      path: 'runs/run-007/output.pptx',
      sizeBytes: 1_800_000,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const DownloadLoading: Story = {
  args: {
    artifact: {
      id: 'art-008',
      kind: 'pptx',
      name: 'ダウンロード中.pptx',
      path: 'runs/run-008/output.pptx',
      sizeBytes: 2_000_000,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
    getDownloadUrl: () => new Promise(() => {}),
  },
};

export const DownloadError: Story = {
  args: {
    artifact: {
      id: 'art-009',
      kind: 'pptx',
      name: 'エラー発生ファイル.pptx',
      path: 'runs/run-009/output.pptx',
      sizeBytes: 1_500_000,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
    getDownloadUrl: async () => {
      throw new Error('Download failed');
    },
  },
};

export const KindPdf: Story = {
  args: {
    artifact: {
      id: 'art-010',
      kind: 'pdf',
      name: 'レポート.pdf',
      path: 'runs/run-010/output.pdf',
      sizeBytes: 512_000,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const KindPng: Story = {
  args: {
    artifact: {
      id: 'art-011',
      kind: 'png',
      name: 'スライドサムネイル.png',
      path: 'runs/run-011/thumbnail.png',
      sizeBytes: 256_000,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const KindDiagnosticsJson: Story = {
  args: {
    artifact: {
      id: 'art-012',
      kind: 'diagnostics-json',
      name: 'diagnostics.json',
      path: 'runs/run-012/diagnostics.json',
      sizeBytes: 8_192,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const KindSourceJs: Story = {
  args: {
    artifact: {
      id: 'art-013',
      kind: 'source-js',
      name: 'slide-script.js',
      path: 'runs/run-013/script.js',
      sizeBytes: 4_096,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};
