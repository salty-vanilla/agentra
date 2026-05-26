import { Hono } from 'hono';
import {
  aggregateByAgent,
  aggregateBySkill,
  aggregateByTimeBucket,
  aggregateByTool,
  aggregateByUser,
  aggregateOverview,
  toTraceDetail,
  toTraceListItem,
} from '../lib/observability-aggregator.js';
import { jsonWithValidation } from '../lib/openapi.js';
import {
  getObservabilityRecordByTraceId,
  listObservabilityRecordsInRange,
} from '../store/observability-store.js';
import { userStore } from '../store/user-store.js';
import {
  applyOffsetPagination,
  parseCursorParam,
  parseDateRange,
  parseLimitParam,
} from './admin-route-utils.js';

type HonoEnv = {
  Variables: {
    userId: string;
    requestId: string;
  };
};

const adminObservabilityRouter = new Hono<HonoEnv>();

adminObservabilityRouter.get('/overview', async (c) => {
  const range = parseDateRange(c.req.query('from'), c.req.query('to'));
  if ('error' in range) {
    return c.json({ error: range.error }, 400);
  }

  const { records } = await listObservabilityRecordsInRange(range);
  const period = { from: range.startDay, to: range.endDay };
  const stats = aggregateOverview(records, period);

  return jsonWithValidation(c, 'getAdminOverview', 200, stats);
});

adminObservabilityRouter.get('/timeseries', async (c) => {
  const range = parseDateRange(c.req.query('from'), c.req.query('to'));
  if ('error' in range) return c.json({ error: range.error }, 400);

  const rawBucket = c.req.query('bucket') ?? 'day';
  if (rawBucket !== 'hour' && rawBucket !== 'day') {
    return c.json({ error: "Invalid 'bucket': must be 'hour' or 'day'." }, 400);
  }

  const { records } = await listObservabilityRecordsInRange(range);
  const buckets = aggregateByTimeBucket(records, rawBucket);
  const period = { from: range.startDay, to: range.endDay };

  return jsonWithValidation(c, 'getAdminTimeseries', 200, { buckets, period });
});

adminObservabilityRouter.get('/users', async (c) => {
  const range = parseDateRange(c.req.query('from'), c.req.query('to'));
  if ('error' in range) {
    return c.json({ error: range.error }, 400);
  }

  const limitResult = parseLimitParam(c.req.query('limit'));
  if (typeof limitResult === 'object' && 'error' in limitResult) {
    return c.json({ error: limitResult.error }, 400);
  }
  const limit = limitResult;

  const cursorResult = parseCursorParam(c.req.query('cursor'));
  if (typeof cursorResult === 'object' && 'error' in cursorResult) {
    return c.json({ error: cursorResult.error }, 400);
  }
  const offset = cursorResult ?? 0;

  const { records } = await listObservabilityRecordsInRange(range);
  // Active users = users with observability records in the selected period.
  // This is NOT a full UserTable listing — users without traces are excluded.
  const allUsers = aggregateByUser(records);

  const allUserRecords = await userStore.listUsers();
  const roleByUserId = new Map(allUserRecords.map((u) => [u.userId, u.role]));

  // Join role onto active users. Unknown userId (no UserTable entry) defaults to 'user'.
  const usersWithRole = allUsers.map((u) => ({
    ...u,
    role: roleByUserId.get(u.userId) ?? 'user',
  }));

  // Paginate after role join so role is present on all pages.
  const { page, nextCursor } = applyOffsetPagination(usersWithRole, limit, offset);

  return jsonWithValidation(c, 'getAdminUsers', 200, {
    users: page,
    ...(nextCursor ? { cursor: nextCursor } : {}),
  });
});

adminObservabilityRouter.get('/agents', async (c) => {
  const range = parseDateRange(c.req.query('from'), c.req.query('to'));
  if ('error' in range) {
    return c.json({ error: range.error }, 400);
  }

  const { records } = await listObservabilityRecordsInRange(range);
  const agents = aggregateByAgent(records);

  return jsonWithValidation(c, 'getAdminAgents', 200, { agents });
});

adminObservabilityRouter.get('/tools', async (c) => {
  const range = parseDateRange(c.req.query('from'), c.req.query('to'));
  if ('error' in range) {
    return c.json({ error: range.error }, 400);
  }

  const { records } = await listObservabilityRecordsInRange(range);
  const tools = aggregateByTool(records);

  return jsonWithValidation(c, 'getAdminTools', 200, { tools });
});

adminObservabilityRouter.get('/skills', async (c) => {
  const range = parseDateRange(c.req.query('from'), c.req.query('to'));
  if ('error' in range) {
    return c.json({ error: range.error }, 400);
  }

  const { records } = await listObservabilityRecordsInRange(range);
  const skills = aggregateBySkill(records);

  return jsonWithValidation(c, 'getAdminSkills', 200, { skills });
});

adminObservabilityRouter.get('/traces', async (c) => {
  const range = parseDateRange(c.req.query('from'), c.req.query('to'));
  if ('error' in range) {
    return c.json({ error: range.error }, 400);
  }

  const statusFilter = c.req.query('status');
  const userIdFilter = c.req.query('userId');
  const limitResult = parseLimitParam(c.req.query('limit'));
  if (typeof limitResult === 'object' && 'error' in limitResult) {
    return c.json({ error: limitResult.error }, 400);
  }
  const limit = limitResult;

  const cursorResult = parseCursorParam(c.req.query('cursor'));
  if (typeof cursorResult === 'object' && 'error' in cursorResult) {
    return c.json({ error: cursorResult.error }, 400);
  }
  const offset = cursorResult ?? 0;

  const { records } = await listObservabilityRecordsInRange(range);

  let filtered = records;
  if (statusFilter) {
    filtered = filtered.filter((r) => r.status === statusFilter);
  }
  if (userIdFilter) {
    filtered = filtered.filter(
      (r) => r.userId.includes(userIdFilter) || r.traceId.includes(userIdFilter),
    );
  }

  const traceItems = filtered.map(toTraceListItem);
  const { page, nextCursor } = applyOffsetPagination(traceItems, limit, offset);

  return jsonWithValidation(c, 'getAdminTraces', 200, {
    traces: page,
    ...(nextCursor ? { cursor: nextCursor } : {}),
  });
});

adminObservabilityRouter.get('/traces/:traceId', async (c) => {
  const traceId = c.req.param('traceId');
  const record = await getObservabilityRecordByTraceId(traceId);

  if (!record) {
    return jsonWithValidation(c, 'getAdminTraceDetail', 404, {
      error: 'Trace not found.',
    });
  }

  return jsonWithValidation(c, 'getAdminTraceDetail', 200, {
    trace: toTraceDetail(record),
  });
});

export { adminObservabilityRouter };
