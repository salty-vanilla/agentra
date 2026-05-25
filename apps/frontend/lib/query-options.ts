import { queryOptions } from '@tanstack/react-query';
import type {
  AdminDateRange,
  AdminPaginationParams,
  AdminTimeseriesParams,
} from '@/lib/api';
import {
  fetchAdminAgents,
  fetchAdminOverview,
  fetchAdminSkills,
  fetchAdminTimeseries,
  fetchAdminTools,
  fetchAdminTraceDetail,
  fetchAdminTraces,
  fetchAdminUsers,
  fetchHealth,
  fetchThreadMessages,
  fetchThreads,
} from '@/lib/api';

const ADMIN_STALE_TIME = 60_000;

export const agentraQueryKeys = {
  health: ['health'] as const,
  threads: ['threads'] as const,
  threadMessages: (threadId: string) => ['thread-messages', threadId] as const,
  adminOverview: (params: AdminDateRange) => ['admin-overview', params] as const,
  adminTimeseries: (params: AdminTimeseriesParams) =>
    ['admin-timeseries', params] as const,
  adminUsers: (params: AdminPaginationParams) => ['admin-users', params] as const,
  adminAgents: (params: AdminDateRange) => ['admin-agents', params] as const,
  adminTools: (params: AdminDateRange) => ['admin-tools', params] as const,
  adminSkills: (params: AdminDateRange) => ['admin-skills', params] as const,
  adminTraces: (params: AdminPaginationParams & { status?: string; userId?: string }) =>
    ['admin-traces', params] as const,
  adminTraceDetail: (traceId: string) => ['admin-trace-detail', traceId] as const,
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

export function adminOverviewQueryOptions(params: AdminDateRange = {}) {
  return queryOptions({
    queryKey: agentraQueryKeys.adminOverview(params),
    queryFn: () => fetchAdminOverview(params),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function adminTimeseriesQueryOptions(params: AdminTimeseriesParams = {}) {
  return queryOptions({
    queryKey: agentraQueryKeys.adminTimeseries(params),
    queryFn: () => fetchAdminTimeseries(params),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function adminUsersQueryOptions(params: AdminPaginationParams = {}) {
  return queryOptions({
    queryKey: agentraQueryKeys.adminUsers(params),
    queryFn: () => fetchAdminUsers(params),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function adminAgentsQueryOptions(params: AdminDateRange = {}) {
  return queryOptions({
    queryKey: agentraQueryKeys.adminAgents(params),
    queryFn: () => fetchAdminAgents(params),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function adminToolsQueryOptions(params: AdminDateRange = {}) {
  return queryOptions({
    queryKey: agentraQueryKeys.adminTools(params),
    queryFn: () => fetchAdminTools(params),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function adminSkillsQueryOptions(params: AdminDateRange = {}) {
  return queryOptions({
    queryKey: agentraQueryKeys.adminSkills(params),
    queryFn: () => fetchAdminSkills(params),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function adminTracesQueryOptions(
  params: AdminPaginationParams & { status?: string; userId?: string } = {},
) {
  return queryOptions({
    queryKey: agentraQueryKeys.adminTraces(params),
    queryFn: () => fetchAdminTraces(params),
    staleTime: ADMIN_STALE_TIME,
  });
}

export function adminTraceDetailQueryOptions(traceId: string | null) {
  return queryOptions({
    queryKey: agentraQueryKeys.adminTraceDetail(traceId ?? ''),
    queryFn: () => fetchAdminTraceDetail(traceId as string),
    enabled: traceId !== null,
    staleTime: ADMIN_STALE_TIME,
  });
}
