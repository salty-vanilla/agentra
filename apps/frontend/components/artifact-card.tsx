'use client';

import type { ArtifactRef } from '@agentra/shared';
import {
  DownloadIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  PresentationIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  className?: string;
}

export function ArtifactCard({ artifact, className }: ArtifactCardProps) {
  const Icon = KIND_ICON[artifact.kind] ?? FileIcon;
  const hasDownload = !!artifact.url;

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
      {hasDownload && (
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label={`${artifact.name}をダウンロード`}
        >
          <a
            href={artifact.url}
            download={artifact.name}
            target="_blank"
            rel="noreferrer"
          >
            <DownloadIcon className="size-4" />
          </a>
        </Button>
      )}
    </div>
  );
}
