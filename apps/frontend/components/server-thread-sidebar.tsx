'use client';

import type { ThreadSummary } from '@agentra/shared';
import { APP_NAME } from '@agentra/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cva } from 'class-variance-authority';
import { MessageSquarePlus, MoreHorizontal, Orbit, Pencil, Trash2 } from 'lucide-react';
import { useTheme } from 'next-themes';
import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar';
import { API_BASE_URL, API_MODE, isMockApiMode } from '@/lib/api-config';

const threadRowVariants = cva(
  'group w-full rounded-lg border px-3 py-1.5 text-left transition-colors',
  {
    variants: {
      selected: {
        true: 'border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground',
        false:
          'border-transparent bg-transparent hover:border-border/60 hover:bg-muted/70',
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
);

const threadActionButtonVariants = cva(
  'size-7 shrink-0 rounded-md text-muted-foreground/70 opacity-0 transition-[opacity,color,background-color] hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:opacity-100',
  {
    variants: {
      selected: {
        true: 'opacity-100 text-foreground',
        false: '',
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
);

function AgentraBrandMark() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = mounted && resolvedTheme === 'dark';

  return (
    <svg
      aria-hidden="true"
      className="!size-11 shrink-0"
      fill="none"
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        fill={isDark ? '#e7e5e4' : '#1c1917'}
        height="864"
        rx="128"
        width="864"
        x="80"
        y="80"
      />
      <path
        d="M304 732 L468 348 C484 310 540 310 556 348 L720 732"
        stroke={isDark ? '#1c1917' : '#fafaf9'}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="116"
      />
      <rect
        fill={isDark ? '#78716c' : '#a8a29e'}
        height="100"
        rx="16"
        width="100"
        x="462"
        y="642"
      />
    </svg>
  );
}

type ServerThreadSidebarProps = React.ComponentProps<typeof Sidebar> & {
  threads: ThreadSummary[];
  selectedThreadId?: string;
  isLoading: boolean;
  onCreateThread: () => void;
  onRenameThread: (threadId: string, title: string) => Promise<void> | void;
  onDeleteThread: (threadId: string) => Promise<void> | void;
  onSelectThread: (threadId: string) => void;
};

export function ServerThreadSidebar({
  threads,
  selectedThreadId,
  isLoading,
  onCreateThread,
  onRenameThread,
  onDeleteThread,
  onSelectThread,
  ...props
}: ServerThreadSidebarProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ThreadSummary | null>(null);
  const [isRenamingThreadId, setIsRenamingThreadId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const rowVirtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => threads[index]?.threadId ?? index,
    estimateSize: () => 46,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 6,
  });

  async function handleConfirmDelete() {
    if (!deleteTarget) {
      return;
    }

    try {
      setIsDeleting(true);
      await onDeleteThread(deleteTarget.threadId);
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Sidebar {...props}>
        <SidebarHeader className="mb-2 border-b">
          <div className="flex items-center justify-between">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton size="lg">
                  <AgentraBrandMark />
                  <div className="mr-6 flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">{APP_NAME}</span>
                    <span className="text-xs">
                      {isMockApiMode ? 'Mock API threads' : 'Backend-driven threads'}
                    </span>
                  </div>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </SidebarHeader>

        <SidebarContent className="flex min-h-0 flex-col px-2">
          <Button
            className="mb-3 h-9 w-full justify-start gap-2 rounded-lg px-3 text-sm"
            onClick={onCreateThread}
            type="button"
            variant="outline"
          >
            <MessageSquarePlus className="size-4" />
            New Thread
          </Button>

          <div className="min-h-0 flex-1">
            {isLoading ? (
              <div className="flex flex-col gap-1">
                {Array.from({ length: 4 }, (_, index) => (
                  <div
                    className="h-14 animate-pulse rounded-lg border border-border/60 bg-muted"
                    key={index}
                  />
                ))}
              </div>
            ) : threads.length > 0 ? (
              <div className="h-full overflow-auto" ref={parentRef}>
                <div
                  className="relative w-full"
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                  }}
                >
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const thread = threads[virtualRow.index];
                    const isSelected = selectedThreadId === thread?.threadId;

                    if (!thread) {
                      return null;
                    }

                    return (
                      <div
                        className="absolute left-0 top-0 w-full pb-1"
                        data-index={virtualRow.index}
                        key={thread.threadId}
                        ref={rowVirtualizer.measureElement}
                        style={{
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        <div className={threadRowVariants({ selected: isSelected })}>
                          <ThreadRowContent
                            isEditing={editingThreadId === thread.threadId}
                            isRenaming={isRenamingThreadId === thread.threadId}
                            isSelected={isSelected}
                            onCancelEdit={() => setEditingThreadId(null)}
                            onDelete={() => setDeleteTarget(thread)}
                            onRename={async (title) => {
                              setEditingThreadId(null);
                              try {
                                setIsRenamingThreadId(thread.threadId);
                                await onRenameThread(thread.threadId, title);
                              } catch (error) {
                                setEditingThreadId(thread.threadId);
                                throw error;
                              } finally {
                                setIsRenamingThreadId(null);
                              }
                            }}
                            onSelect={() => onSelectThread(thread.threadId)}
                            onStartEdit={() => setEditingThreadId(thread.threadId)}
                            thread={thread}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/80 bg-card px-3 py-4 text-muted-foreground text-sm leading-6">
                スレッドはまだありません。送信すると backend 側に保存されます。
              </div>
            )}
          </div>
        </SidebarContent>

        <SidebarFooter className="border-t">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Orbit className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">Current mode</span>
                  <span>{API_MODE === 'mock' ? 'MSW mock API' : 'Backend API'}</span>
                  <span className="text-xs text-muted-foreground">{API_BASE_URL}</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Delete Thread</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            {deleteTarget
              ? `「${deleteTarget.title}」を削除します。この操作は取り消せません。`
              : 'このスレッドを削除します。この操作は取り消せません。'}
          </DialogDescription>
          <DialogFooter>
            <Button
              onClick={() => setDeleteTarget(null)}
              type="button"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={isDeleting}
              onClick={() => void handleConfirmDelete()}
              type="button"
              variant="destructive"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type ThreadRowContentProps = {
  thread: ThreadSummary;
  isEditing: boolean;
  isRenaming: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onRename: (title: string) => Promise<void> | void;
  onDelete: () => void;
};

function ThreadRowContent({
  thread,
  isEditing,
  isRenaming,
  isSelected,
  onSelect,
  onStartEdit,
  onCancelEdit,
  onRename,
  onDelete,
}: ThreadRowContentProps) {
  async function handleSubmit(title: string) {
    if (title.length === 0 || title === thread.title) {
      onCancelEdit();
      return;
    }

    try {
      await onRename(title);
    } catch {
      // The parent re-opens editing and shows a toast when persistence fails.
    }
  }

  if (isEditing) {
    return (
      <div className="flex w-full min-w-0 items-center">
        <Input
          autoFocus
          defaultValue={thread.title}
          disabled={isRenaming}
          onBlur={(event) => {
            if (!isRenaming) {
              void handleSubmit(event.target.value.trim());
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleSubmit(event.currentTarget.value.trim());
            }

            if (event.key === 'Escape') {
              event.preventDefault();
              onCancelEdit();
              event.currentTarget.blur();
            }
          }}
          placeholder="Thread name"
        />
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 items-center gap-0.5">
      <button className="min-w-0 flex-1 text-left" onClick={onSelect} type="button">
        <p className="truncate font-medium text-sm">{thread.title}</p>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Thread actions for ${thread.title}`}
            className={threadActionButtonVariants({ selected: isSelected })}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onStartEdit}>
            <Pencil className="size-3.5" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={onDelete}
          >
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
