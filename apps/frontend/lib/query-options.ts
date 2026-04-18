import { queryOptions } from '@tanstack/react-query';
import { fetchHealth, fetchThreadMessages, fetchThreads } from '@/lib/api';

export const agentraQueryKeys = {
  health: ['health'] as const,
  threads: ['threads'] as const,
  threadMessages: (threadId: string) => ['thread-messages', threadId] as const,
};

export function healthQueryOptions() {
  return queryOptions({
    queryKey: agentraQueryKeys.health,
    queryFn: fetchHealth,
    retry: false,
  });
}

export function threadsQueryOptions() {
  return queryOptions({
    queryKey: agentraQueryKeys.threads,
    queryFn: fetchThreads,
  });
}

export function threadMessagesQueryOptions(threadId: string) {
  return queryOptions({
    queryKey: agentraQueryKeys.threadMessages(threadId),
    queryFn: () => fetchThreadMessages(threadId),
    enabled: threadId.length > 0,
  });
}
