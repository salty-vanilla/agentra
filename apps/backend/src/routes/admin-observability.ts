import { Hono } from 'hono';
import {
  aggregateByAgent,
  aggregateBySkill,
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

type HonoEnv = {
  Variables: {
    userId: string;
    requestId: string;
  };
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDateRange(
  from: string | undefined,
  to: string | undefined,
): { startDay: string; endDay: string } | { error: string } {
  const startDay = from ?? todayUtc();
  const endDay = to ?? todayUtc();

  if (!DATE_PATTERN.test(startDay)) {
    return { error: `Invalid 'from' date: "${startDay}". Expected YYYY-MM-DD.` };
  }
  if (!DATE_PATTERN.test(endDay)) {
    return { error: `Invalid 'to' date: "${endDay}". Expected YYYY-MM-DD.` };
  }

  return { startDay, endDay };
}

function applyOffsetPagination<T>(
  items: T[],
  limit: number,
  cursor?: string,
): { page: T[]; nextCursor?: string } {
  const offset = cursor ? Number(Buffer.from(cursor, 'base64').toString()) : 0;
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const nextCursor =
    nextOffset < items.length
      ? Buffer.from(String(nextOffset)).toString('base64')
      : undefined;
  return { page, nextCursor };
}

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

adminObservabilityRouter.get('/users', async (c) => {
  const range = parseDateRange(c.req.query('from'), c.req.query('to'));
  if ('error' in range) {
    return c.json({ error: range.error }, 400);
  }

  const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200);
  const cursor = c.req.query('cursor');

  const { records } = await listObservabilityRecordsInRange(range);
  const allUsers = aggregateByUser(records);
  const { page, nextCursor } = applyOffsetPagination(allUsers, limit, cursor);

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
  const limit = Math.min(Number(c.req.query('limit') ?? '50'), 200);
  const cursor = c.req.query('cursor');

  const { records } = await listObservabilityRecordsInRange(range);

  let filtered = records;
  if (statusFilter) {
    filtered = filtered.filter((r) => r.status === statusFilter);
  }
  if (userIdFilter) {
    filtered = filtered.filter((r) => r.userId === userIdFilter);
  }

  const traceItems = filtered.map(toTraceListItem);
  const { page, nextCursor } = applyOffsetPagination(traceItems, limit, cursor);

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
