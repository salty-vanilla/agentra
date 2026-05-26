import type { ObservabilityRecord } from '@agentra/shared';
import { Hono } from 'hono';
import { getCognitoClient } from '../lib/cognito-client.js';
import { jsonWithValidation, readJsonBody, validateRequest } from '../lib/openapi.js';
import { getAdminGroupName } from '../lib/user-role.js';
import { listObservabilityRecordsInRange } from '../store/observability-store.js';
import { userStore } from '../store/user-store.js';
import {
  applyOffsetPagination,
  parseCursorParam,
  parseLimitParam,
  todayUtc,
} from './admin-route-utils.js';

const OBS_WINDOW_DAYS = 30;

type HonoEnv = {
  Variables: {
    userId: string;
    requestId: string;
  };
};

type AdminUser = {
  userId: string;
  sub: string;
  email: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastSeenAt?: string;
  requestCount?: number;
  totalTokens?: number;
  errorRate?: number;
  mostUsedAgent?: string;
  mostUsedTool?: string;
};

function topByCount(counts: Map<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = name;
    }
  }
  return best;
}

function buildObsWindow(): { startDay: string; endDay: string } {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - OBS_WINDOW_DAYS);
  return {
    startDay: start.toISOString().slice(0, 10),
    endDay: todayUtc(),
  };
}

function buildObsStatsByUser(records: ObservabilityRecord[]): Map<
  string,
  {
    lastSeenAt: string;
    requestCount: number;
    totalTokens: number;
    errorRate: number;
    mostUsedAgent?: string;
    mostUsedTool?: string;
  }
> {
  const byUser = new Map<string, ObservabilityRecord[]>();
  for (const r of records) {
    const existing = byUser.get(r.userId) ?? [];
    byUser.set(r.userId, [...existing, r]);
  }

  const result = new Map<
    string,
    {
      lastSeenAt: string;
      requestCount: number;
      totalTokens: number;
      errorRate: number;
      mostUsedAgent?: string;
      mostUsedTool?: string;
    }
  >();

  for (const [userId, userRecords] of byUser) {
    const errorCount = userRecords.filter((r) => r.status === 'error').length;
    const totalTokens = userRecords.reduce(
      (sum, r) => sum + (r.tokenUsage?.totalTokens ?? 0),
      0,
    );
    const lastSeenAt = userRecords.reduce(
      (max, r) => (r.completedAt > max ? r.completedAt : max),
      userRecords[0]?.completedAt ?? '',
    );

    const agentCounts = new Map<string, number>();
    const toolCounts = new Map<string, number>();
    for (const r of userRecords) {
      for (const a of r.agentCalls) {
        agentCounts.set(a.agentName, (agentCounts.get(a.agentName) ?? 0) + 1);
      }
      for (const t of r.toolCalls) {
        toolCounts.set(t.toolName, (toolCounts.get(t.toolName) ?? 0) + 1);
      }
    }

    const mostUsedAgent = topByCount(agentCounts);
    const mostUsedTool = topByCount(toolCounts);
    result.set(userId, {
      lastSeenAt,
      requestCount: userRecords.length,
      totalTokens,
      errorRate: userRecords.length === 0 ? 0 : errorCount / userRecords.length,
      ...(mostUsedAgent !== undefined ? { mostUsedAgent } : {}),
      ...(mostUsedTool !== undefined ? { mostUsedTool } : {}),
    });
  }

  return result;
}

const adminUsersRouter = new Hono<HonoEnv>();

adminUsersRouter.get('/', async (c) => {
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

  const userRecords = await userStore.listUsers();

  const obsWindow = buildObsWindow();
  const { records } = await listObservabilityRecordsInRange(obsWindow);
  const obsByUserId = buildObsStatsByUser(records);

  const adminUsers: AdminUser[] = userRecords
    .map((u) => {
      const obs = obsByUserId.get(u.userId);
      return {
        userId: u.userId,
        sub: u.sub,
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        ...(obs
          ? {
              lastSeenAt: obs.lastSeenAt,
              requestCount: obs.requestCount,
              totalTokens: obs.totalTokens,
              errorRate: obs.errorRate,
              ...(obs.mostUsedAgent ? { mostUsedAgent: obs.mostUsedAgent } : {}),
              ...(obs.mostUsedTool ? { mostUsedTool: obs.mostUsedTool } : {}),
            }
          : {}),
      };
    })
    .sort(
      (a, b) =>
        b.createdAt.localeCompare(a.createdAt) || a.userId.localeCompare(b.userId),
    );

  const { page, nextCursor } = applyOffsetPagination(adminUsers, limit, offset);

  return jsonWithValidation(c, 'listAdminUsers', 200, {
    users: page,
    ...(nextCursor ? { cursor: nextCursor } : {}),
  });
});

adminUsersRouter.post('/invite', async (c) => {
  const validationError = await validateRequest(c, 'inviteAdminUser');
  if (validationError) return validationError;

  const body = (await readJsonBody(c)) as {
    email: string;
    role: 'admin' | 'user';
    name?: string;
    sendInvitation?: boolean;
  };

  const { email, role, name, sendInvitation = true } = body;
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    return c.json(
      { error: 'Server misconfiguration: COGNITO_USER_POOL_ID not set' },
      500,
    );
  }

  const { AdminCreateUserCommand, AdminAddUserToGroupCommand } = await import(
    '@aws-sdk/client-cognito-identity-provider'
  );
  const cognito = getCognitoClient();

  let sub: string;
  try {
    const userAttributes = [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      ...(name ? [{ Name: 'name', Value: name }] : []),
    ];
    const result = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: userAttributes,
        MessageAction: sendInvitation ? undefined : 'SUPPRESS',
        DesiredDeliveryMediums: sendInvitation ? ['EMAIL'] : undefined,
      }),
    );
    sub = result.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ?? email;
  } catch (err) {
    if ((err as { name?: string }).name === 'UsernameExistsException') {
      return c.json({ error: 'A user with this email already exists' }, 409);
    }
    throw err;
  }

  if (role === 'admin') {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: email,
        GroupName: getAdminGroupName(),
      }),
    );
  }

  // Write projection record so the invited user appears in /admin/users before first login.
  // getOrCreateUser will sync the role from Cognito group membership on first login.
  const record = await userStore.createInvitedUser(sub, email, role);

  return jsonWithValidation(c, 'inviteAdminUser', 201, {
    email,
    role,
    sub,
    userId: record.userId,
  });
});

export { adminUsersRouter };
