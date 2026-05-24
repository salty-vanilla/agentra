import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { ArtifactCard } from './artifact-card';

const meta = {
  title: 'Components/ArtifactCard',
  component: ArtifactCard,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
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
      url: 'https://example.com/files/art-001.pptx',
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
      url: 'https://example.com/files/art-002.pptx',
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
      url: 'https://example.com/files/art-003.pdf',
      mimeType: 'application/pdf',
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const NoDownloadUrl: Story = {
  args: {
    artifact: {
      id: 'art-004',
      kind: 'pptx',
      name: '処理中のファイル.pptx',
      sizeBytes: 1_024_000,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};

export const LongFileName: Story = {
  args: {
    artifact: {
      id: 'art-005',
      kind: 'pptx',
      name: '非常に長いファイル名のサンプル_プロジェクトABC_フェーズ2_最終確認版_レビュー済み_2026年5月.pptx',
      url: 'https://example.com/files/art-005.pptx',
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
      id: 'art-006',
      kind: 'pptx',
      name: 'モバイル表示確認.pptx',
      url: 'https://example.com/files/art-006.pptx',
      sizeBytes: 1_800_000,
      createdAt: '2026-05-24T09:00:00.000Z',
    },
  },
};
