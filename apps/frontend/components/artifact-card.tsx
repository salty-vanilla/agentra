'use client';

import type { ArtifactRef } from '@agentra/shared';
import {
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  Loader2Icon,
  PresentationIcon,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { fetchArtifactDownloadUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const KIND_ICON: Partial<Record<ArtifactRef['kind'], React.ElementType>> = {
  pptx: PresentationIcon,
  pdf: FileTextIcon,
  png: ImageIcon,
  jpg: ImageIcon,
  text: FileTextIcon,
  'source-js': FileTextIcon,
};

export interface ArtifactCardProps {
  artifact: ArtifactRef;
  threadId: string;
  className?: string;
  getDownloadUrl?: (threadId: string, artifactId: string) => Promise<{ url: string }>;
}

export function ArtifactCard({
  artifact,
  threadId,
  className,
  getDownloadUrl,
}: ArtifactCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const Icon = KIND_ICON[artifact.kind] ?? FileIcon;
  const isAvailable = !!artifact.path && artifact.exists !== false;

  async function handleDownload() {
    setIsDownloading(true);
    try {
      const resolver = getDownloadUrl ?? fetchArtifactDownloadUrl;
      const { url } = await resolver(threadId, artifact.id);
      window.location.assign(url);
    } catch {
      toast.error('ダウンロードに失敗しました');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-3 text-sm',
        className,
      )}
    >
      <Icon className="size-8 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={artifact.name}>
          {artifact.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {artifact.kind.toUpperCase()}
          {artifact.sizeBytes != null && ` • ${formatBytes(artifact.sizeBytes)}`}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        disabled={!isAvailable || isDownloading}
        aria-label={
          isAvailable ? `${artifact.name}をダウンロード` : 'ファイルが利用できません'
        }
        onClick={() => void handleDownload()}
      >
        {isDownloading ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <DownloadIcon className="size-4" />
        )}
      </Button>
    </div>
  );
}
