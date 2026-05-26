'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  BookX,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { presignKbUpload, removeKbDocument, triggerKbSync } from '@/lib/api';
import type { IngestionJobSummary, KbDocument } from '@/lib/generated/model';
import { PresignDocumentRequestContentType } from '@/lib/generated/model';
import {
  agentraQueryKeys,
  kbDocumentsQueryOptions,
  kbIngestionJobsQueryOptions,
  kbStatusQueryOptions,
} from '@/lib/query-options';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_UPLOAD_SIZE_BYTES = 52_428_800; // 50 MB

const EXTENSION_TO_CONTENT_TYPE: Record<string, PresignDocumentRequestContentType> = {
  pdf: PresignDocumentRequestContentType['application/pdf'],
  txt: PresignDocumentRequestContentType['text/plain'],
  md: PresignDocumentRequestContentType['text/markdown'],
  doc: PresignDocumentRequestContentType['application/msword'],
  docx: PresignDocumentRequestContentType[
    'application/vndopenxmlformats-officedocumentwordprocessingmldocument'
  ],
};

const ACCEPTED_EXTENSIONS = Object.keys(EXTENSION_TO_CONTENT_TYPE);
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getExtension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

function contentTypeForFile(file: File): PresignDocumentRequestContentType | null {
  const ext = getExtension(file.name);
  return EXTENSION_TO_CONTENT_TYPE[ext] ?? null;
}

function jobStatusVariant(
  status: IngestionJobSummary['status'],
): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (status === 'COMPLETE') return 'default';
  if (status === 'IN_PROGRESS' || status === 'STARTING') return 'secondary';
  if (status === 'FAILED') return 'destructive';
  return 'outline';
}

function JobStatusIcon({ status }: { status: IngestionJobSummary['status'] }) {
  if (status === 'COMPLETE') return <CheckCircle2 className="size-3 shrink-0" />;
  if (status === 'IN_PROGRESS' || status === 'STARTING')
    return <Loader2 className="size-3 shrink-0 animate-spin" />;
  if (status === 'FAILED') return <AlertCircle className="size-3 shrink-0" />;
  return <Clock className="size-3 shrink-0" />;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NotConfiguredCard() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <BookX className="size-10 text-muted-foreground/50" />
        <p className="font-medium">Knowledge Base not configured</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Set <code>BEDROCK_KB_ID</code> and <code>KB_DATA_SOURCE_BUCKET_NAME</code> on
          the backend to enable document management.
        </p>
      </CardContent>
    </Card>
  );
}

interface DeleteDialogProps {
  document: KbDocument | null;
  onConfirm: () => void;
  onClose: () => void;
  isPending: boolean;
}

function DeleteDocumentDialog({
  document,
  onConfirm,
  onClose,
  isPending,
}: DeleteDialogProps) {
  return (
    <Dialog open={document !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete document?</DialogTitle>
          <DialogDescription>
            <span className="font-medium">{document?.name}</span> will be permanently
            deleted from the knowledge base. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DocumentRowProps {
  doc: KbDocument;
  onDeleteClick: (doc: KbDocument) => void;
}

function DocumentRow({ doc, onDeleteClick }: DocumentRowProps) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{doc.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatBytes(doc.sizeBytes)} · {formatDate(doc.lastModified)}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onDeleteClick(doc)}
        aria-label={`Delete ${doc.name}`}
      >
        <Trash2 className="size-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function KbPanel() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<KbDocument | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [allDocuments, setAllDocuments] = useState<KbDocument[]>([]);
  const [pageToken, setPageToken] = useState<string | undefined>(undefined);
  const isAppendingRef = useRef(false);

  const statusQuery = useQuery(kbStatusQueryOptions());
  const documentsQuery = useQuery(kbDocumentsQueryOptions(pageToken));

  useEffect(() => {
    const docs = documentsQuery.data?.documents;
    if (docs === undefined || documentsQuery.isFetching) return;
    if (isAppendingRef.current) {
      setAllDocuments((prev) => [...prev, ...docs]);
      isAppendingRef.current = false;
    } else {
      setAllDocuments(docs);
    }
  }, [documentsQuery.data, documentsQuery.isFetching]);
  const jobsQuery = useQuery(kbIngestionJobsQueryOptions());

  const latestJob = jobsQuery.data?.jobs[0] ?? null;

  const deleteMutation = useMutation({
    mutationFn: (key: string) => removeKbDocument(key),
    onSuccess: async () => {
      setDeleteTarget(null);
      isAppendingRef.current = false;
      setPageToken(undefined);
      setAllDocuments([]);
      await queryClient.invalidateQueries({ queryKey: ['kb-documents'] });
      await queryClient.invalidateQueries({ queryKey: agentraQueryKeys.kbIngestionJobs });
    },
  });

  const syncMutation = useMutation({
    mutationFn: triggerKbSync,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: agentraQueryKeys.kbIngestionJobs });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const contentType = contentTypeForFile(file);
      if (!contentType)
        throw new Error(`Unsupported file type: .${getExtension(file.name)}`);
      if (file.size > MAX_UPLOAD_SIZE_BYTES) throw new Error('File exceeds 50 MB limit.');

      const { presignedUrl } = await presignKbUpload({
        fileName: file.name,
        contentType,
        sizeBytes: file.size,
      });

      const uploadResp = await fetch(presignedUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': contentType },
      });
      if (!uploadResp.ok) throw new Error(`Upload failed: ${uploadResp.status}`);
    },
    onSuccess: async () => {
      setUploadError(null);
      isAppendingRef.current = false;
      setPageToken(undefined);
      setAllDocuments([]);
      await queryClient.invalidateQueries({ queryKey: ['kb-documents'] });
      await queryClient.invalidateQueries({ queryKey: agentraQueryKeys.kbIngestionJobs });
    },
    onError: (err: Error) => {
      setUploadError(err.message);
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    uploadMutation.mutate(file);
  }

  function handleLoadMore() {
    const next = documentsQuery.data?.nextToken;
    if (!next) return;
    isAppendingRef.current = true;
    setPageToken(next);
  }

  if (statusQuery.isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!statusQuery.data?.configured) {
    return <NotConfiguredCard />;
  }

  const { kbId, dataSourceBucketName } = statusQuery.data;
  const hasNextPage = Boolean(documentsQuery.data?.nextToken);

  return (
    <div className="flex flex-col gap-6">
      {/* Status card */}
      <Card size="sm">
        <CardHeader>
          <CardTitle>Knowledge Base</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-xs text-muted-foreground">
          {kbId && (
            <p>
              KB ID: <span className="font-mono text-foreground">{kbId}</span>
            </p>
          )}
          {dataSourceBucketName && (
            <p>
              Bucket:{' '}
              <span className="font-mono text-foreground">{dataSourceBucketName}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Documents section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Documents</CardTitle>
            <div className="flex items-center gap-2">
              {uploadError && (
                <p className="text-xs text-destructive max-w-xs truncate">
                  {uploadError}
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending}
              >
                {uploadMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
                Upload
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ATTR}
                className="hidden"
                onChange={handleFileChange}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {documentsQuery.isLoading ? (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : allDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No documents uploaded yet.
            </p>
          ) : (
            <div>
              {allDocuments.map((doc) => (
                <DocumentRow key={doc.key} doc={doc} onDeleteClick={setDeleteTarget} />
              ))}
            </div>
          )}

          {hasNextPage && (
            <div className="flex items-center justify-end pt-3">
              <Button
                size="sm"
                variant="outline"
                onClick={handleLoadMore}
                disabled={documentsQuery.isFetching}
              >
                {documentsQuery.isFetching && <Loader2 className="size-4 animate-spin" />}
                Load more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sync section */}
      <Card size="sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Ingestion</CardTitle>
            <Button
              size="sm"
              variant={latestJob?.status === 'FAILED' ? 'destructive' : 'outline'}
              onClick={() => syncMutation.mutate()}
              disabled={
                syncMutation.isPending ||
                latestJob?.status === 'IN_PROGRESS' ||
                latestJob?.status === 'STARTING'
              }
            >
              {syncMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              Re-Sync
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {jobsQuery.isLoading ? (
            <Skeleton className="h-5 w-32" />
          ) : latestJob ? (
            <div className="flex flex-col gap-1">
              <Badge variant={jobStatusVariant(latestJob.status)} className="w-fit">
                <JobStatusIcon status={latestJob.status} />
                {latestJob.status.replace('_', ' ')}
              </Badge>
              <p className="text-xs text-muted-foreground">
                Started {formatDate(latestJob.startedAt)}
                {latestJob.completedAt &&
                  ` · Completed ${formatDate(latestJob.completedAt)}`}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No ingestion jobs yet.</p>
          )}
        </CardContent>
      </Card>

      <DeleteDocumentDialog
        document={deleteTarget}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.key)}
        onClose={() => setDeleteTarget(null)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
