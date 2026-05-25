import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { HttpResponse, http } from 'msw';
import {
  getDeleteKbDocumentMockHandler,
  getGetKbStatusMockHandler,
  getListKbDocumentsMockHandler,
  getListKbIngestionJobsMockHandler,
  getPresignKbDocumentMockHandler,
  getStartKbSyncMockHandler,
} from '@/mocks/generated/agentra.msw';
import type {
  IngestionJobsResponse,
  KbDocumentsResponse,
  KbStatusResponse,
} from '@/mocks/generated/model';
import { KbPanel } from './kb-panel';

// ── Shared fixtures ───────────────────────────────────────────────────────────

const CONFIGURED_STATUS: KbStatusResponse = {
  configured: true,
  kbId: 'ABCDEF1234',
  dataSourceId: 'DS-567890',
  dataSourceBucketName: 'agentra-dev-manufacturing-docs',
};

const UNCONFIGURED_STATUS: KbStatusResponse = {
  configured: false,
};

const SAMPLE_DOCUMENTS: KbDocumentsResponse = {
  documents: [
    {
      key: 'manufacturing-line/machine-a-manual.pdf',
      name: 'machine-a-manual.pdf',
      sizeBytes: 2_457_600,
      lastModified: '2026-05-20T10:00:00Z',
    },
    {
      key: 'manufacturing-line/safety-checklist.docx',
      name: 'safety-checklist.docx',
      sizeBytes: 89_600,
      lastModified: '2026-05-18T08:30:00Z',
    },
    {
      key: 'manufacturing-line/line-b-specs.txt',
      name: 'line-b-specs.txt',
      sizeBytes: 14_200,
      lastModified: '2026-05-15T14:00:00Z',
    },
  ],
};

const EMPTY_DOCUMENTS: KbDocumentsResponse = { documents: [] };

const COMPLETE_JOBS: IngestionJobsResponse = {
  jobs: [
    {
      jobId: 'job-complete-001',
      status: 'COMPLETE',
      startedAt: '2026-05-20T10:05:00Z',
      completedAt: '2026-05-20T10:06:12Z',
    },
  ],
};

const IN_PROGRESS_JOBS: IngestionJobsResponse = {
  jobs: [
    {
      jobId: 'job-inprogress-001',
      status: 'IN_PROGRESS',
      startedAt: '2026-05-26T09:00:00Z',
    },
  ],
};

const FAILED_JOBS: IngestionJobsResponse = {
  jobs: [
    {
      jobId: 'job-failed-001',
      status: 'FAILED',
      startedAt: '2026-05-25T14:00:00Z',
      completedAt: '2026-05-25T14:00:45Z',
    },
  ],
};

const MOCK_PRESIGN_URL = 'https://mock-s3.example.com/upload/test-key';

// ── Meta ──────────────────────────────────────────────────────────────────────

const meta = {
  title: 'Admin/KbPanel',
  component: KbPanel,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof KbPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Stories ───────────────────────────────────────────────────────────────────

export const Unconfigured: Story = {
  parameters: {
    msw: {
      handlers: [
        getGetKbStatusMockHandler(UNCONFIGURED_STATUS),
        getListKbDocumentsMockHandler(EMPTY_DOCUMENTS),
        getListKbIngestionJobsMockHandler({ jobs: [] }),
      ],
    },
  },
};

export const EmptyDocuments: Story = {
  parameters: {
    msw: {
      handlers: [
        getGetKbStatusMockHandler(CONFIGURED_STATUS),
        getListKbDocumentsMockHandler(EMPTY_DOCUMENTS),
        getListKbIngestionJobsMockHandler({ jobs: [] }),
      ],
    },
  },
};

export const PopulatedDocuments: Story = {
  parameters: {
    msw: {
      handlers: [
        getGetKbStatusMockHandler(CONFIGURED_STATUS),
        getListKbDocumentsMockHandler(SAMPLE_DOCUMENTS),
        getListKbIngestionJobsMockHandler(COMPLETE_JOBS),
        getDeleteKbDocumentMockHandler(),
        getPresignKbDocumentMockHandler({
          presignedUrl: MOCK_PRESIGN_URL,
          key: 'manufacturing-line/test.pdf',
          expiresAt: '2026-05-26T09:15:00Z',
        }),
        http.put(MOCK_PRESIGN_URL, () => new HttpResponse(null, { status: 200 })),
        getStartKbSyncMockHandler({ jobId: 'job-new-001', status: 'STARTING' }),
      ],
    },
  },
};

export const IngestionInProgress: Story = {
  parameters: {
    msw: {
      handlers: [
        getGetKbStatusMockHandler(CONFIGURED_STATUS),
        getListKbDocumentsMockHandler(SAMPLE_DOCUMENTS),
        getListKbIngestionJobsMockHandler(IN_PROGRESS_JOBS),
      ],
    },
  },
};

export const IngestionFailed: Story = {
  parameters: {
    msw: {
      handlers: [
        getGetKbStatusMockHandler(CONFIGURED_STATUS),
        getListKbDocumentsMockHandler(SAMPLE_DOCUMENTS),
        getListKbIngestionJobsMockHandler(FAILED_JOBS),
        getStartKbSyncMockHandler({ jobId: 'job-retry-001', status: 'STARTING' }),
        getDeleteKbDocumentMockHandler(),
      ],
    },
  },
};

export const DeleteConfirmationOpen: Story = {
  parameters: {
    msw: {
      handlers: [
        getGetKbStatusMockHandler(CONFIGURED_STATUS),
        getListKbDocumentsMockHandler(SAMPLE_DOCUMENTS),
        getListKbIngestionJobsMockHandler(COMPLETE_JOBS),
        getDeleteKbDocumentMockHandler(),
      ],
    },
  },
};

export const UploadReady: Story = {
  parameters: {
    msw: {
      handlers: [
        getGetKbStatusMockHandler(CONFIGURED_STATUS),
        getListKbDocumentsMockHandler(SAMPLE_DOCUMENTS),
        getListKbIngestionJobsMockHandler(COMPLETE_JOBS),
        getPresignKbDocumentMockHandler({
          presignedUrl: MOCK_PRESIGN_URL,
          key: 'manufacturing-line/new-doc.pdf',
          expiresAt: '2026-05-26T09:15:00Z',
        }),
        http.put(MOCK_PRESIGN_URL, () => new HttpResponse(null, { status: 200 })),
        getListKbDocumentsMockHandler({
          documents: [
            ...SAMPLE_DOCUMENTS.documents,
            {
              key: 'manufacturing-line/new-doc.pdf',
              name: 'new-doc.pdf',
              sizeBytes: 512_000,
              lastModified: new Date().toISOString(),
            },
          ],
        }),
      ],
    },
  },
};
