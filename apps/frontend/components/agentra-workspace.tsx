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
import { parseAsString, useQueryState } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Thread } from '@/components/assistant-ui/thread';
import type { ModelKey } from '@/components/model-selector';
import { ServerThreadSidebar } from '@/components/server-thread-sidebar';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import {
  createThread,
  deleteThreadById,
  PrematureSseEofError,
  sendChat,
  sendChatStream,
  updateThreadTitle,
} from '@/lib/api';
import { isMockApiMode } from '@/lib/api-config';
import type {
  ArtifactManifest,
  ChatCommand,
  ChatRequest as FrontendChatRequest,
  ProgressSummaryEvent,
  SubAgentProgressEvent,
} from '@/lib/generated/model';
import {
  agentraQueryKeys,
  healthQueryOptions,
  threadMessagesQueryOptions,
  threadsQueryOptions,
} from '@/lib/query-options';
import {
  createInitialProgressEvent,
  SIMULATED_ERROR_EVENT,
  SIMULATED_SLIDE_PROGRESS_EVENTS,
  SIMULATED_STEP_DELAYS_MS,
} from '@/lib/slide-progress';
import { cn } from '@/lib/utils';

type HealthState = 'checking' | 'online' | 'offline';

function normalizeSlidePresentationCommand(
  command: ChatCommand & { type: 'create_slide_presentation' },
): ChatCommand {
  const normalized: ChatCommand = {
    type: command.type,
    topic: command.topic,
  };

  if (command.audience) {
    normalized.audience = command.audience;
  }
  if (command.purpose) {
    normalized.purpose = command.purpose;
  }
  if (command.slideCount !== undefined) normalized.slideCount = command.slideCount;
  if (command.durationMinutes !== undefined)
    normalized.durationMinutes = command.durationMinutes;
  if (command.language) {
    normalized.language = command.language;
  }
  if (command.tone) {
    normalized.tone = command.tone;
  }
  if (command.outputFormat) {
    normalized.outputFormat = command.outputFormat;
  }

  return normalized;
}

export function AgentraWorkspace() {
  const [selectedThreadId, setSelectedThreadId] = useQueryState(
    'threadId',
    parseAsString.withOptions({ clearOnDefault: true }),
  );
  const [selectedModel, setSelectedModel] = useState<ModelKey>('sonnet');
  const [pendingCreatedThreadId, setPendingCreatedThreadId] = useState<string | null>(
    null,
  );
  const [liveObservabilitySummary, setLiveObservabilitySummary] =
    useState<ChatObservationSummary | null>(null);
  const [slideCommandActive, setSlideCommandActive] = useState(false);
  const [slideDialogOpen, setSlideDialogOpen] = useState(false);
  const [pendingSlideCommand, setPendingSlideCommand] = useState<ChatCommand | null>(
    null,
  );
  const [progressEvents, setProgressEvents] = useState<ProgressSummaryEvent[]>([]);
  const [activeProgressPhase, setActiveProgressPhase] = useState<string | undefined>();
  const [subAgentProgressEvents, setSubAgentProgressEvents] = useState<
    SubAgentProgressEvent[]
  >([]);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressIndexRef = useRef(0);
  // Use a ref so the memoized modelAdapter can read the latest model key without
  // invalidating the memo on every selector change.
  const selectedModelRef = useRef<ModelKey>('sonnet');
  selectedModelRef.current = selectedModel;
  const pendingSlideCommandRef = useRef<ChatCommand | null>(null);
  pendingSlideCommandRef.current = pendingSlideCommand;
  const queryClient = useQueryClient();

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    progressIndexRef.current = 0;
  }, []);

  // Mock-only: schedule simulated progress steps
  const scheduleNextStep = useCallback(() => {
    const index = progressIndexRef.current;
    if (index >= SIMULATED_SLIDE_PROGRESS_EVENTS.length) return;
    const delay = SIMULATED_STEP_DELAYS_MS[index] ?? 10_000;
    if (delay === 0) return;

    progressTimerRef.current = setTimeout(() => {
      const nextEvent = SIMULATED_SLIDE_PROGRESS_EVENTS[index];
      if (!nextEvent) return;
      const event: ProgressSummaryEvent = {
        ...nextEvent,
        timestamp: new Date().toISOString(),
      };
      setProgressEvents((prev) => [...prev, event]);
      setActiveProgressPhase(event.phase);
      progressIndexRef.current = index + 1;
      scheduleNextStep();
    }, delay);
  }, []);

  // Mock-only: start simulation for mock API mode
  const startProgressSimulation = useCallback(
    (command: ChatCommand & { type: 'create_slide_presentation' }) => {
      clearProgressTimer();
      const initialEvent = createInitialProgressEvent(command);
      setProgressEvents([initialEvent]);
      setActiveProgressPhase('request_understanding');
      progressIndexRef.current = 0;
      scheduleNextStep();
    },
    [clearProgressTimer, scheduleNextStep],
  );

  // Real mode: handle progress events from SSE stream
  const handleProgressEvent = useCallback((event: ProgressSummaryEvent) => {
    setProgressEvents((prev) => [...prev, event]);
    setActiveProgressPhase(event.phase);
  }, []);

  const handleSubAgentProgressEvent = useCallback((event: SubAgentProgressEvent) => {
    setSubAgentProgressEvents((prev) => {
      const existingIndex = prev.findIndex((item) => item.stage === event.stage);
      if (existingIndex < 0) {
        return [...prev, event];
      }

      return prev.map((item, index) => (index === existingIndex ? event : item));
    });
  }, []);

  const stopProgressSimulation = useCallback(
    (error?: boolean) => {
      clearProgressTimer();
      if (error) {
        const errorEvent: ProgressSummaryEvent = {
          ...SIMULATED_ERROR_EVENT,
          timestamp: new Date().toISOString(),
        };
        setProgressEvents((prev) => [...prev, errorEvent]);
        setActiveProgressPhase('error');
      } else {
        setProgressEvents([]);
        setActiveProgressPhase(undefined);
      }
    },
    [clearProgressTimer],
  );

  const healthQuery = useQuery(healthQueryOptions());
  const threadsQuery = useQuery(threadsQueryOptions());
  const threadMessagesQuery = useQuery({
    ...threadMessagesQueryOptions(selectedThreadId ?? ''),
    enabled: selectedThreadId !== null,
  });

  const createThreadMutation = useMutation({
    mutationFn: createThread,
    onSuccess: async (response) => {
      setPendingCreatedThreadId(response.thread.threadId);
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
        setSubAgentProgressEvents([]);
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
          ...(selectedThreadId ? { threadId: selectedThreadId } : {}),
          model: selectedModelRef.current,
        };

        // Detect /slide command or use pending slide command
        let resolvedCommand = pendingSlideCommandRef.current;
        let resolvedMessage = chatRequest.message;

        const slideMatch = resolvedMessage.match(/^\/slide(\s|$)/);
        if (slideMatch) {
          const topic = resolvedMessage.slice(slideMatch[0].length).trim();
          if (!topic) {
            // /slide without topic: open the dialog so user can fill in details
            setSlideDialogOpen(true);
            return;
          }
          if (topic) {
            resolvedCommand = {
              type: 'create_slide_presentation',
              topic,
              language: /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(
                topic,
              )
                ? 'ja'
                : 'en',
              slideCount: 'auto',
              durationMinutes: 'auto',
              outputFormat: 'pptx',
            };
            resolvedMessage = topic;
          }
        }

        // If slide command from dialog, use command topic as message if message is empty or the topic
        if (resolvedCommand?.type === 'create_slide_presentation' && !slideMatch) {
          if (!resolvedMessage || resolvedMessage === resolvedCommand.topic) {
            resolvedMessage = resolvedCommand.topic;
          }
          // Update topic to match message if user typed something
          resolvedCommand = normalizeSlidePresentationCommand({
            ...resolvedCommand,
            topic: resolvedMessage,
          });
        }

        const normalizedCommand =
          resolvedCommand?.type === 'create_slide_presentation'
            ? normalizeSlidePresentationCommand(resolvedCommand)
            : null;

        const finalRequest: FrontendChatRequest = {
          ...chatRequest,
          message: resolvedMessage,
          ...(normalizedCommand ? { command: normalizedCommand } : {}),
        };

        // Start progress tracking for slide commands
        if (normalizedCommand?.type === 'create_slide_presentation') {
          if (isMockApiMode) {
            // Mock mode: simulate progress since there's no SSE stream
            startProgressSimulation(normalizedCommand);
          } else {
            // Real mode: reset progress state; real events arrive via SSE
            clearProgressTimer();
            setProgressEvents([]);
            setActiveProgressPhase(undefined);
          }
        }

        // Clear pending command
        setPendingSlideCommand(null);
        setSlideCommandActive(false);

        if (isMockApiMode) {
          // Simulate sub_agent_progress events sequentially with realistic delays
          handleSubAgentProgressEvent({
            type: 'sub_agent_progress',
            stage: 'router',
            status: 'running',
            timestamp: new Date().toISOString(),
          });

          const response = await sendChat(finalRequest, { signal: abortSignal }).catch(
            (error: unknown) => {
              stopProgressSimulation(true);
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

          await mockSleep(350, abortSignal);
          if (abortSignal?.aborted) {
            stopProgressSimulation();
            setSubAgentProgressEvents([]);
            return;
          }
          handleSubAgentProgressEvent({
            type: 'sub_agent_progress',
            stage: 'router',
            status: 'complete',
            durationMs: 110,
            timestamp: new Date().toISOString(),
          });

          if (response.observabilitySummary) {
            const nonRouterTools = response.observabilitySummary.toolCalls.filter(
              (tc) => tc.toolName !== 'router',
            );
            for (const tool of nonRouterTools) {
              await mockSleep(200, abortSignal);
              if (abortSignal?.aborted) {
                stopProgressSimulation();
                setSubAgentProgressEvents([]);
                return;
              }
              handleSubAgentProgressEvent({
                type: 'sub_agent_progress',
                stage: tool.toolName,
                status: 'running',
                timestamp: new Date().toISOString(),
              });
              await mockSleep(600, abortSignal);
              if (abortSignal?.aborted) {
                stopProgressSimulation();
                setSubAgentProgressEvents([]);
                return;
              }
              handleSubAgentProgressEvent({
                type: 'sub_agent_progress',
                stage: tool.toolName,
                status: tool.status === 'success' ? 'complete' : 'error',
                durationMs: tool.durationMs,
                timestamp: new Date().toISOString(),
              });
            }
            setLiveObservabilitySummary(response.observabilitySummary);
          }

          await setSelectedThreadId(response.threadId);
          await queryClient.invalidateQueries({ queryKey: agentraQueryKeys.threads });
          await queryClient.fetchQuery(threadMessagesQueryOptions(response.threadId));
          stopProgressSimulation();

          {
            const mockContent: Array<
              | { type: 'text'; text: string }
              | { type: 'data'; name: string; data: unknown }
            > = [{ type: 'text', text: response.reply }];
            if (response.observabilitySummary) {
              mockContent.push({
                type: 'data',
                name: 'observability',
                data: response.observabilitySummary,
              });
            }
            if (response.artifactManifest) {
              mockContent.push({
                type: 'data',
                name: 'artifact',
                data: response.artifactManifest,
              });
            }
            yield {
              content: mockContent,
              ...(response.observabilitySummary
                ? {
                    metadata: {
                      custom: { observabilitySummary: response.observabilitySummary },
                    },
                  }
                : {}),
            };
          }
          setSubAgentProgressEvents([]);
          return;
        }

        // Real mode: SSE streaming
        let fullText = '';
        let streamThreadId: string | null = null;
        let doneThreadId: string | null = null;
        let doneObservabilitySummary: ChatObservationSummary | null = null;
        let latestArtifactManifest: ArtifactManifest | undefined;

        try {
          for await (const event of sendChatStream(finalRequest, abortSignal)) {
            if (event.type === 'thread_started') {
              streamThreadId = event.threadId;
            } else if (event.type === 'text') {
              fullText += event.text;
              yield { content: [{ type: 'text', text: fullText }] };
            } else if (event.type === 'progress_summary') {
              handleProgressEvent(event.event);
            } else if (event.type === 'sub_agent_progress') {
              handleSubAgentProgressEvent(event.event);
            } else if (event.type === 'observation') {
              doneObservabilitySummary = event.observation;
              setLiveObservabilitySummary(event.observation);
            } else if (event.type === 'artifact') {
              latestArtifactManifest = event.manifest;
            } else if (event.type === 'done') {
              doneThreadId = event.threadId;
              if (event.observabilitySummary) {
                doneObservabilitySummary = event.observabilitySummary;
                setLiveObservabilitySummary(event.observabilitySummary);
              }
            } else if (event.type === 'error') {
              if (event.threadId) {
                streamThreadId = event.threadId;
              }
              if (event.observabilitySummary) {
                doneObservabilitySummary = event.observabilitySummary;
                setLiveObservabilitySummary(event.observabilitySummary);
              }
              throw new Error(event.error);
            }
          }
        } catch (error: unknown) {
          stopProgressSimulation(true);
          setSubAgentProgressEvents([]);
          const threadIdForInvalidation = selectedThreadId ?? streamThreadId;
          if (threadIdForInvalidation) {
            await queryClient.invalidateQueries({ queryKey: agentraQueryKeys.threads });
            await queryClient.invalidateQueries({
              queryKey: agentraQueryKeys.threadMessages(threadIdForInvalidation),
            });
          }
          const isPrematureEof = error instanceof PrematureSseEofError;
          toast.error('メッセージ送信に失敗しました', {
            description: getErrorMessage(
              isPrematureEof
                ? new Error('接続が予期せず切断されました。再試行してください。')
                : error,
              'バックエンドまたは AgentCore の状態を確認してください。',
            ),
            duration: 6000,
          });
          throw error;
        }

        const resolvedThreadId = doneThreadId ?? selectedThreadId;
        stopProgressSimulation();
        if (resolvedThreadId) {
          await setSelectedThreadId(resolvedThreadId);
          await queryClient.invalidateQueries({ queryKey: agentraQueryKeys.threads });
          await queryClient.fetchQuery(threadMessagesQueryOptions(resolvedThreadId));
        }
        if (doneObservabilitySummary || latestArtifactManifest) {
          if (doneObservabilitySummary) {
            setLiveObservabilitySummary(doneObservabilitySummary);
          }
          yield {
            content: [
              { type: 'text', text: fullText },
              ...(doneObservabilitySummary
                ? [
                    {
                      type: 'data' as const,
                      name: 'observability',
                      data: doneObservabilitySummary,
                    },
                  ]
                : []),
              ...(latestArtifactManifest
                ? [
                    {
                      type: 'data' as const,
                      name: 'artifact',
                      data: latestArtifactManifest,
                    },
                  ]
                : []),
            ],
          };
        }
        setSubAgentProgressEvents([]);
      },
    }),
    [
      queryClient,
      selectedThreadId,
      setSelectedThreadId,
      clearProgressTimer,
      handleProgressEvent,
      handleSubAgentProgressEvent,
      startProgressSimulation,
      stopProgressSimulation,
    ],
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
    clearProgressTimer();
    setProgressEvents([]);
    setActiveProgressPhase(undefined);
    setSubAgentProgressEvents([]);
    setSlideCommandActive(false);
    setPendingSlideCommand(null);
  }, [selectedThreadId, clearProgressTimer]);

  useEffect(() => {
    if (persistedLatestObservabilitySummary) {
      setLiveObservabilitySummary(persistedLatestObservabilitySummary);
    }
  }, [persistedLatestObservabilitySummary]);

  useEffect(() => {
    if (
      pendingCreatedThreadId &&
      threads.some((thread) => thread.threadId === pendingCreatedThreadId)
    ) {
      setPendingCreatedThreadId(null);
    }
  }, [pendingCreatedThreadId, threads]);

  useEffect(() => {
    if (threads.length === 0) {
      if (selectedThreadId !== null) {
        void setSelectedThreadId(null);
      }

      return;
    }

    if (
      pendingCreatedThreadId &&
      selectedThreadId === pendingCreatedThreadId &&
      !threads.some((thread) => thread.threadId === pendingCreatedThreadId)
    ) {
      return;
    }

    if (
      !selectedThreadId ||
      !threads.some((thread) => thread.threadId === selectedThreadId)
    ) {
      void setSelectedThreadId(threads[0]?.threadId ?? null);
    }
  }, [pendingCreatedThreadId, selectedThreadId, setSelectedThreadId, threads]);

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

  const handleSlideCommandActivate = useCallback((params?: Record<string, unknown>) => {
    setSlideCommandActive(true);
    const cmd: ChatCommand = {
      type: 'create_slide_presentation',
      topic: '', // will be filled from chat message on send
      language: (params?.language as 'ja' | 'en') ?? 'ja',
      slideCount: (params?.slideCount as number | 'auto') ?? 'auto',
      durationMinutes: (params?.durationMinutes as number | 'auto') ?? 'auto',
      outputFormat: 'pptx',
    };

    if (typeof params?.audience === 'string' && params.audience.length > 0) {
      cmd.audience = params.audience;
    }
    if (typeof params?.purpose === 'string' && params.purpose.length > 0) {
      cmd.purpose = params.purpose;
    }
    if (typeof params?.tone === 'string' && params.tone.length > 0) {
      cmd.tone = params.tone;
    }

    setPendingSlideCommand(cmd);

    // If topic is provided from dialog, auto-submit by setting topic in command
    // The user still needs to press send; the topic becomes the message
  }, []);

  const handleSlideCommandDeactivate = useCallback(() => {
    setSlideCommandActive(false);
    setPendingSlideCommand(null);
  }, []);

  const displayedThreadCount = threads.length;
  const visibleObservabilitySummary =
    liveObservabilitySummary ?? persistedLatestObservabilitySummary;

  const showDebugPanel =
    process.env.NODE_ENV === 'development' ||
    process.env.NEXT_PUBLIC_SHOW_DEBUG_PANEL === 'true';

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
                {showDebugPanel && (
                  <div className="hidden text-right text-muted-foreground text-xs sm:block">
                    <p>{displayedThreadCount} thread(s)</p>
                    {visibleObservabilitySummary ? (
                      <p>
                        {formatTokenUsage(visibleObservabilitySummary)} / tools:{' '}
                        {visibleObservabilitySummary.toolCallCount} /{' '}
                        {formatDuration(visibleObservabilitySummary.durationMs)}
                      </p>
                    ) : null}
                  </div>
                )}
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

            <main className="h-[calc(100svh-4rem)] min-h-0">
              <section className="h-full min-h-0">
                <Thread
                  modelValue={selectedModel}
                  onModelChange={setSelectedModel}
                  {...(selectedThreadId ? { threadId: selectedThreadId } : {})}
                  slideCommandActive={slideCommandActive}
                  onSlideCommandActivate={handleSlideCommandActivate}
                  onSlideCommandDeactivate={handleSlideCommandDeactivate}
                  slideDialogOpen={slideDialogOpen}
                  onSlideDialogOpenChange={setSlideDialogOpen}
                  progressEvents={progressEvents}
                  subAgentProgressEvents={subAgentProgressEvents}
                  {...(activeProgressPhase ? { activeProgressPhase } : {})}
                />
              </section>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </AssistantRuntimeProviderCore>
  );
}

function mockSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true },
    );
  });
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
  const isAssistant = message.role === 'assistant';
  const contentParts: ThreadMessageLike['content'] = [
    { type: 'text', text: message.content },
    ...(isAssistant && message.observabilitySummary
      ? [
          {
            type: 'data' as const,
            name: 'observability',
            data: message.observabilitySummary,
          },
        ]
      : []),
    ...(isAssistant && message.artifactManifest
      ? [{ type: 'data' as const, name: 'artifact', data: message.artifactManifest }]
      : []),
  ];

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
