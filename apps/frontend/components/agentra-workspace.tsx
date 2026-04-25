'use client';

import type { ChatObservationSummary, PersistedChatMessage } from '@agentra/shared';
import { APP_NAME } from '@agentra/shared';
import { AssistantRuntimeProvider as AssistantRuntimeProviderCore } from '@assistant-ui/core/react';
import {
  type ChatModelAdapter,
  type ThreadMessage,
  type ThreadMessageLike,
  useLocalRuntime,
} from '@assistant-ui/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BotMessageSquare, Database, FolderKanban, Sparkles } from 'lucide-react';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Thread } from '@/components/assistant-ui/thread';
import type { ModelKey } from '@/components/model-selector';
import { ServerThreadSidebar } from '@/components/server-thread-sidebar';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import {
  createThread,
  deleteThreadById,
  sendChat,
  sendChatStream,
  updateThreadTitle,
} from '@/lib/api';
import { isMockApiMode } from '@/lib/api-config';
import {
  agentraQueryKeys,
  healthQueryOptions,
  threadMessagesQueryOptions,
  threadsQueryOptions,
} from '@/lib/query-options';
import { cn } from '@/lib/utils';

type HealthState = 'checking' | 'online' | 'offline';

const stackCards = [
  {
    title: 'Assistant UI',
    description:
      'Chat surface, composer, threads, and message actions now come from assistant-ui.',
    icon: BotMessageSquare,
  },
  {
    title: 'Hono Backend',
    description:
      'The current runtime streams responses from /chat over SSE and forwards requests to AgentCore Runtime.',
    icon: Sparkles,
  },
  {
    title: 'Shared Contract',
    description:
      'Request and response validation still flows through packages/shared and zod schemas.',
    icon: FolderKanban,
  },
  {
    title: 'Phase 3 Ready',
    description:
      'The sidebar layout is ready for DynamoDB-backed thread metadata and persisted history.',
    icon: Database,
  },
];

const nextSteps = [
  'Replace LocalRuntime thread memory with backend thread persistence.',
  'Add authentication-aware user identity and access control boundaries.',
  'Add citations/tools rendering so streamed responses can show structured outputs.',
];

export function AgentraWorkspace() {
  const [selectedThreadId, setSelectedThreadId] = useQueryState(
    'threadId',
    parseAsString.withOptions({ clearOnDefault: true }),
  );
  const [selectedModel, setSelectedModel] = useState<ModelKey>('sonnet');
  const [liveObservabilitySummary, setLiveObservabilitySummary] =
    useState<ChatObservationSummary | null>(null);
  // Use a ref so the memoized modelAdapter can read the latest model key without
  // invalidating the memo on every selector change.
  const selectedModelRef = useRef<ModelKey>('sonnet');
  selectedModelRef.current = selectedModel;
  const queryClient = useQueryClient();

  const healthQuery = useQuery(healthQueryOptions());
  const threadsQuery = useQuery(threadsQueryOptions());
  const threadMessagesQuery = useQuery({
    ...threadMessagesQueryOptions(selectedThreadId ?? ''),
    enabled: selectedThreadId !== null,
  });

  const createThreadMutation = useMutation({
    mutationFn: createThread,
    onSuccess: async (response) => {
      await setSelectedThreadId(response.thread.threadId);
      await queryClient.invalidateQueries({ queryKey: agentraQueryKeys.threads });
      queryClient.setQueryData(
        agentraQueryKeys.threadMessages(response.thread.threadId),
        {
          messages: [],
        },
      );
    },
  });

  const updateThreadMutation = useMutation({
    mutationFn: ({ threadId, title }: { threadId: string; title: string }) =>
      updateThreadTitle(threadId, { title }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: agentraQueryKeys.threads });
      await queryClient.invalidateQueries({
        queryKey: agentraQueryKeys.threadMessages(variables.threadId),
      });
    },
  });

  const deleteThreadMutation = useMutation({
    mutationFn: ({ threadId }: { threadId: string }) => deleteThreadById(threadId),
    onSuccess: async (_, variables) => {
      const remainingThreads = threads.filter(
        (thread) => thread.threadId !== variables.threadId,
      );
      const nextSelectedThreadId = remainingThreads[0]?.threadId ?? null;
      await setSelectedThreadId(nextSelectedThreadId);
      await queryClient.invalidateQueries({ queryKey: agentraQueryKeys.threads });
      queryClient.removeQueries({
        queryKey: agentraQueryKeys.threadMessages(variables.threadId),
      });
    },
  });

  const threads = threadsQuery.data?.threads ?? [];
  const persistedMessages: PersistedChatMessage[] =
    threadMessagesQuery.data?.messages ?? [];
  const isThreadsLoading = threadsQuery.isLoading;
  const isMessagesLoading = threadMessagesQuery.isFetching;

  const initialMessages = useMemo(
    () => persistedMessages.map(convertPersistedMessageToRuntimeMessage),
    [persistedMessages],
  );
  const persistedLatestObservabilitySummary = useMemo(
    () => findLatestAssistantObservabilitySummary(persistedMessages),
    [persistedMessages],
  );

  const modelAdapter = useMemo<ChatModelAdapter>(
    () => ({
      async *run({ abortSignal, messages }) {
        setLiveObservabilitySummary(null);
        const normalizedHistory = normalizeThreadMessages(messages);
        const lastUserMessageIndex = findLastUserMessageIndex(normalizedHistory);

        if (lastUserMessageIndex < 0) {
          yield {
            content: [
              {
                type: 'text',
                text: 'ユーザーメッセージが見つかりませんでした。入力後に再度お試しください。',
              },
            ],
          };
          return;
        }

        const latestUserMessage = normalizedHistory[lastUserMessageIndex];

        if (!latestUserMessage) {
          yield {
            content: [
              {
                type: 'text',
                text: 'ユーザーメッセージの読込に失敗しました。新しい thread で再試行してください。',
              },
            ],
          };
          return;
        }

        const chatRequest = {
          message: latestUserMessage.content,
          history: normalizedHistory.slice(0, lastUserMessageIndex),
          ...(selectedThreadId ? { threadId: selectedThreadId } : {}),
          model: selectedModelRef.current,
        };

        if (isMockApiMode) {
          // Mock mode: non-streaming, existing sendChat path
          const response = await sendChat(chatRequest, { signal: abortSignal }).catch(
            (error: unknown) => {
              toast.error('メッセージ送信に失敗しました', {
                description: getErrorMessage(
                  error,
                  'バックエンドまたはモック API の状態を確認してください。',
                ),
                duration: 6000,
              });
              throw error;
            },
          );
          await setSelectedThreadId(response.threadId);
          await queryClient.invalidateQueries({ queryKey: agentraQueryKeys.threads });
          await queryClient.fetchQuery(threadMessagesQueryOptions(response.threadId));
          yield { content: [{ type: 'text', text: response.reply }] };
          return;
        }

        // Real mode: SSE streaming
        let fullText = '';
        let doneThreadId: string | null = null;
        let doneObservabilitySummary: ChatObservationSummary | null = null;

        try {
          for await (const event of sendChatStream(chatRequest, abortSignal)) {
            if (event.type === 'text') {
              fullText += event.text;
              yield { content: [{ type: 'text', text: fullText }] };
            } else if (event.type === 'observation') {
              doneObservabilitySummary = event.observation;
              setLiveObservabilitySummary(event.observation);
            } else if (event.type === 'done') {
              doneThreadId = event.threadId;
              if (event.observabilitySummary) {
                doneObservabilitySummary = event.observabilitySummary;
                setLiveObservabilitySummary(event.observabilitySummary);
              }
            } else if (event.type === 'error') {
              if (event.observabilitySummary) {
                doneObservabilitySummary = event.observabilitySummary;
                setLiveObservabilitySummary(event.observabilitySummary);
              }
              throw new Error(event.error);
            }
          }
        } catch (error: unknown) {
          toast.error('メッセージ送信に失敗しました', {
            description: getErrorMessage(
              error,
              'バックエンドまたは AgentCore の状態を確認してください。',
            ),
            duration: 6000,
          });
          throw error;
        }

        const resolvedThreadId = doneThreadId ?? selectedThreadId;
        if (resolvedThreadId) {
          await setSelectedThreadId(resolvedThreadId);
          await queryClient.invalidateQueries({ queryKey: agentraQueryKeys.threads });
          await queryClient.fetchQuery(threadMessagesQueryOptions(resolvedThreadId));
        }
        if (doneObservabilitySummary) {
          setLiveObservabilitySummary(doneObservabilitySummary);
        }
      },
    }),
    [queryClient, selectedThreadId, setSelectedThreadId],
  );

  const runtime = useLocalRuntime(modelAdapter, {
    initialMessages,
  });

  useEffect(() => {
    runtime.thread.reset(initialMessages);
  }, [initialMessages, runtime]);

  useEffect(() => {
    void selectedThreadId;
    setLiveObservabilitySummary(null);
  }, [selectedThreadId]);

  useEffect(() => {
    if (persistedLatestObservabilitySummary) {
      setLiveObservabilitySummary(persistedLatestObservabilitySummary);
    }
  }, [persistedLatestObservabilitySummary]);

  useEffect(() => {
    if (threads.length === 0) {
      if (selectedThreadId !== null) {
        void setSelectedThreadId(null);
      }

      return;
    }

    if (
      !selectedThreadId ||
      !threads.some((thread) => thread.threadId === selectedThreadId)
    ) {
      void setSelectedThreadId(threads[0]?.threadId ?? null);
    }
  }, [selectedThreadId, setSelectedThreadId, threads]);

  const health: HealthState = useMemo(() => {
    if (healthQuery.isPending) {
      return 'checking';
    }

    return healthQuery.isError ? 'offline' : 'online';
  }, [healthQuery.isError, healthQuery.isPending]);

  const statusClassName = useMemo(() => {
    switch (health) {
      case 'online':
        return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-900';
      case 'offline':
        return 'border-rose-500/20 bg-rose-500/10 text-rose-900';
      default:
        return 'border-amber-500/20 bg-amber-500/10 text-amber-900';
    }
  }, [health]);

  const healthLabel = useMemo<Record<HealthState, string>>(
    () => ({
      checking: isMockApiMode ? 'Checking mock API' : 'Checking backend',
      online: isMockApiMode ? 'Mock API ready' : 'Backend online',
      offline: isMockApiMode ? 'Mock API offline' : 'Backend offline',
    }),
    [],
  );

  async function handleCreateThread() {
    try {
      await createThreadMutation.mutateAsync({});
    } catch (error) {
      toast.error('スレッド作成に失敗しました', {
        description: getErrorMessage(error, 'しばらく待ってから再試行してください。'),
        duration: 6000,
      });
    }
  }

  async function handleRenameThread(threadId: string, title: string) {
    try {
      await updateThreadMutation.mutateAsync({ threadId, title });
    } catch (error) {
      toast.error('スレッド名の更新に失敗しました', {
        description: getErrorMessage(
          error,
          '保存処理に失敗しました。再試行してください。',
        ),
        duration: 6000,
      });
      throw error;
    }
  }

  async function handleDeleteThread(threadId: string) {
    try {
      await deleteThreadMutation.mutateAsync({ threadId });
    } catch (error) {
      toast.error('スレッド削除に失敗しました', {
        description: getErrorMessage(
          error,
          '削除処理に失敗しました。再試行してください。',
        ),
        duration: 6000,
      });
      throw error;
    }
  }

  const displayedThreadCount = threads.length;
  const visibleObservabilitySummary =
    liveObservabilitySummary ?? persistedLatestObservabilitySummary;

  return (
    <AssistantRuntimeProviderCore runtime={runtime}>
      <SidebarProvider defaultOpen>
        <div className="flex h-svh w-full overflow-hidden bg-transparent">
          <ServerThreadSidebar
            isLoading={isThreadsLoading}
            onCreateThread={() => void handleCreateThread()}
            onDeleteThread={(threadId) => handleDeleteThread(threadId)}
            onRenameThread={(threadId, title) => handleRenameThread(threadId, title)}
            onSelectThread={(threadId) => void setSelectedThreadId(threadId)}
            {...(selectedThreadId ? { selectedThreadId } : {})}
            threads={threads}
          />

          <SidebarInset className="min-w-0 bg-transparent">
            <header className="flex h-16 items-center justify-between gap-4 border-b border-border/60 bg-background/75 px-4 backdrop-blur md:px-6">
              <div className="flex min-w-0 items-center gap-2 md:gap-3">
                <SidebarTrigger className="-ml-1" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-base tracking-tight">
                    {APP_NAME}
                  </p>
                  <p className="truncate text-muted-foreground text-xs md:text-sm">
                    assistant-ui + shadcn/ui based internal agent workspace
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="hidden text-right text-muted-foreground text-xs sm:block">
                  <p>{displayedThreadCount} server thread(s)</p>
                  {visibleObservabilitySummary ? (
                    <p>
                      {formatTokenUsage(visibleObservabilitySummary)} / tools:{' '}
                      {visibleObservabilitySummary.toolCallCount} /{' '}
                      {formatDuration(visibleObservabilitySummary.durationMs)}
                    </p>
                  ) : (
                    <p>
                      {isMessagesLoading
                        ? 'Loading messages...'
                        : 'Current phase: backend sync'}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    'inline-flex items-center rounded-full border px-3 py-1 font-medium text-xs',
                    statusClassName,
                  )}
                >
                  {healthLabel[health]}
                </span>
              </div>
            </header>

            <main className="grid h-[calc(100svh-4rem)] min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <section className="min-h-0 border-b border-border/50 xl:border-r xl:border-b-0">
                <Thread modelValue={selectedModel} onModelChange={setSelectedModel} />
              </section>

              <aside className="hidden min-h-0 flex-col justify-between bg-background/65 p-6 xl:flex">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="font-semibold text-sm uppercase tracking-[0.18em] text-teal-800/80">
                      Build Surface
                    </p>
                    <h2 className="font-semibold text-2xl tracking-tight text-foreground">
                      Frontend-first, without painting ourselves into a corner
                    </h2>
                    <p className="text-muted-foreground text-sm leading-7">
                      The current surface is designed to keep the chat UX moving while
                      preserving the contract boundary to Hono, DynamoDB, and AgentCore.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {stackCards.map(({ description, icon: Icon, title }) => (
                      <article
                        className="rounded-2xl border border-border/70 bg-card/90 p-4 shadow-sm"
                        key={title}
                      >
                        <div className="mb-3 flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-2xl bg-teal-600/10 text-teal-800">
                            <Icon className="size-4" />
                          </div>
                          <h3 className="font-medium text-sm">{title}</h3>
                        </div>
                        <p className="text-muted-foreground text-sm leading-6">
                          {description}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 rounded-3xl border border-border/70 bg-card/95 p-5 shadow-sm">
                  <div className="space-y-1">
                    <p className="font-semibold text-sm">Next implementation slice</p>
                    <p className="text-muted-foreground text-sm">
                      Once this UI baseline is accepted, the next meaningful step is
                      thread and message persistence.
                    </p>
                  </div>

                  <ul className="space-y-2 text-sm leading-6">
                    {nextSteps.map((step) => (
                      <li className="flex gap-2 text-muted-foreground" key={step}>
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal-700" />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className="w-full rounded-full"
                    type="button"
                    variant="secondary"
                  >
                    UI foundation in place
                  </Button>
                </div>
              </aside>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProviderCore>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallback;
}

function convertPersistedMessageToRuntimeMessage(
  message: PersistedChatMessage,
): ThreadMessageLike {
  const contentParts: ThreadMessageLike['content'] =
    message.observabilitySummary && message.role === 'assistant'
      ? [
          { type: 'text', text: message.content },
          {
            type: 'data',
            name: 'observability',
            data: message.observabilitySummary,
          },
        ]
      : [{ type: 'text', text: message.content }];

  return {
    role: message.role,
    content: contentParts,
    ...(message.observabilitySummary
      ? {
          metadata: {
            custom: {
              observabilitySummary: message.observabilitySummary,
            },
          },
        }
      : {}),
  };
}

function findLatestAssistantObservabilitySummary(
  messages: readonly PersistedChatMessage[],
): ChatObservationSummary | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant' && message.observabilitySummary) {
      return message.observabilitySummary;
    }
  }
  return null;
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return '0ms';
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatTokenUsage(summary: ChatObservationSummary): string {
  const total = summary.tokenUsage?.totalTokens;
  if (typeof total === 'number') {
    return `tokens:${total}`;
  }
  return 'tokens:n/a';
}

function normalizeThreadMessages(messages: readonly ThreadMessage[]) {
  return messages
    .map((message) => ({
      role: message.role,
      content: extractMessageText(message),
    }))
    .filter((message) => message.content.length > 0);
}

function extractMessageText(message: ThreadMessage) {
  return message.content
    .map((part) => {
      switch (part.type) {
        case 'text':
        case 'reasoning':
          return part.text;
        case 'source':
          return part.title ?? part.url;
        case 'tool-call':
          return `[tool:${part.toolName}] ${part.argsText}`;
        case 'file':
          return part.filename ?? '[file]';
        case 'image':
          return part.filename ?? '[image]';
        case 'data':
          return typeof part.data === 'string' ? part.data : JSON.stringify(part.data);
        case 'audio':
          return '[audio]';
        default:
          return '';
      }
    })
    .join('\n')
    .trim();
}

function findLastUserMessageIndex(
  messages: Array<{ role: ThreadMessage['role']; content: string }>,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return index;
    }
  }

  return -1;
}
