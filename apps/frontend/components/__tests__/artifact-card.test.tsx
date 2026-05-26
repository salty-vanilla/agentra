import type { ArtifactRef } from '@agentra/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// window.location.assign is not spyable in jsdom; override via Object.defineProperty in beforeEach
import { ArtifactCard } from '../artifact-card';

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

const baseArtifact: ArtifactRef = {
  id: 'art-001',
  kind: 'pptx',
  name: 'presentation.pptx',
  path: 'runs/mock/presentation.pptx',
  sizeBytes: 1_234_567,
  createdAt: '2026-05-07T00:00:00.000Z',
  exists: true,
};

describe('ArtifactCard', () => {
  const assignMock = vi.fn();

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...window.location, assign: assignMock },
    });
  });

  afterEach(() => {
    assignMock.mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it('renders artifact name and formatted size', () => {
    render(<ArtifactCard artifact={baseArtifact} threadId="thread-1" />);
    expect(screen.getByText('presentation.pptx')).toBeInTheDocument();
    expect(screen.getByText(/1\.2 MB/)).toBeInTheDocument();
  });

  it('disables download button when artifact.path is absent', () => {
    const artifact = { ...baseArtifact, path: undefined };
    render(<ArtifactCard artifact={artifact} threadId="thread-1" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disables download button when artifact.exists is false', () => {
    const artifact = { ...baseArtifact, exists: false };
    render(<ArtifactCard artifact={artifact} threadId="thread-1" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('calls getDownloadUrl and navigates on successful download', async () => {
    const getDownloadUrl = vi
      .fn()
      .mockResolvedValue({ url: 'https://example.com/file.pptx' });
    render(
      <ArtifactCard
        artifact={baseArtifact}
        threadId="thread-1"
        getDownloadUrl={getDownloadUrl}
      />,
    );

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(getDownloadUrl).toHaveBeenCalledWith('thread-1', 'art-001');
      expect(assignMock).toHaveBeenCalledWith('https://example.com/file.pptx');
    });
  });

  it('shows loading spinner while download is in progress', async () => {
    let resolveDownload!: (v: { url: string }) => void;
    const getDownloadUrl = vi.fn(
      () =>
        new Promise<{ url: string }>((resolve) => {
          resolveDownload = resolve;
        }),
    );
    render(
      <ArtifactCard
        artifact={baseArtifact}
        threadId="thread-1"
        getDownloadUrl={getDownloadUrl}
      />,
    );

    await userEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button')).toBeDisabled();
    resolveDownload({ url: 'https://example.com/file.pptx' });
  });

  it('shows toast error when getDownloadUrl throws', async () => {
    const getDownloadUrl = vi.fn().mockRejectedValue(new Error('Network error'));
    render(
      <ArtifactCard
        artifact={baseArtifact}
        threadId="thread-1"
        getDownloadUrl={getDownloadUrl}
      />,
    );

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith('ダウンロードに失敗しました');
    });
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
