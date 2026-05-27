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
    userGroups: string[];
    callerSub: string;
  };
};

type AdminUser = {
  userId: string;
  sub: string;
  email: string;
  role: 'admin' | 'user';
  enabled: boolean;
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

async function countEnabledAdmins(
  // biome-ignore lint/suspicious/noExplicitAny: Cognito client type from dynamic import
  cognito: any,
  userPoolId: string,
  groupName: string,
  stopAfter = 2,
): Promise<number> {
  const { ListUsersInGroupCommand } = await import(
    '@aws-sdk/client-cognito-identity-provider'
  );
  let count = 0;
  let nextToken: string | undefined;
  do {
    // biome-ignore lint/suspicious/noExplicitAny: Cognito SDK response
    const result: any = await cognito.send(
      new ListUsersInGroupCommand({
        UserPoolId: userPoolId,
        GroupName: groupName,
        ...(nextToken ? { NextToken: nextToken } : {}),
      }),
    );
    for (const u of result.Users ?? []) {
      if (u.Enabled !== false) count++;
      if (count >= stopAfter) return count;
    }
    nextToken = result.NextToken;
  } while (nextToken);
  return count;
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
        enabled: u.enabled,
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

adminUsersRouter.post('/:sub/promote-admin', async (c) => {
  const targetSub = c.req.param('sub');

  const target = await userStore.getUserBySub(targetSub);
  if (!target) return c.json({ error: 'User not found' }, 404);

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    return c.json(
      { error: 'Server misconfiguration: COGNITO_USER_POOL_ID not set' },
      500,
    );
  }

  const { AdminAddUserToGroupCommand } = await import(
    '@aws-sdk/client-cognito-identity-provider'
  );
  const cognito = getCognitoClient();

  try {
    await cognito.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: userPoolId,
        Username: target.email,
        GroupName: getAdminGroupName(),
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'UserNotFoundException') {
      return c.json({ error: 'User not found in Cognito' }, 404);
    }
    throw err;
  }

  const updated = await userStore.updateRole(targetSub, 'admin');
  return jsonWithValidation(c, 'promoteAdminUser', 200, {
    sub: updated.sub,
    userId: updated.userId,
    role: updated.role,
    enabled: updated.enabled,
  });
});

adminUsersRouter.post('/:sub/remove-admin', async (c) => {
  const targetSub = c.req.param('sub');
  const callerSub = c.get('callerSub');

  if (targetSub === callerSub) {
    return c.json({ error: 'You cannot remove your own admin role' }, 403);
  }

  const target = await userStore.getUserBySub(targetSub);
  if (!target) return c.json({ error: 'User not found' }, 404);

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    return c.json(
      { error: 'Server misconfiguration: COGNITO_USER_POOL_ID not set' },
      500,
    );
  }

  const cognito = getCognitoClient();
  const enabledAdminCount = await countEnabledAdmins(
    cognito,
    userPoolId,
    getAdminGroupName(),
  );
  if (enabledAdminCount <= 1) {
    return c.json({ error: 'Cannot remove the last enabled admin' }, 409);
  }

  const { AdminRemoveUserFromGroupCommand } = await import(
    '@aws-sdk/client-cognito-identity-provider'
  );

  try {
    await cognito.send(
      new AdminRemoveUserFromGroupCommand({
        UserPoolId: userPoolId,
        Username: target.email,
        GroupName: getAdminGroupName(),
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'UserNotFoundException') {
      return c.json({ error: 'User not found in Cognito' }, 404);
    }
    throw err;
  }

  const updated = await userStore.updateRole(targetSub, 'user');
  return jsonWithValidation(c, 'removeAdminUser', 200, {
    sub: updated.sub,
    userId: updated.userId,
    role: updated.role,
    enabled: updated.enabled,
  });
});

adminUsersRouter.post('/:sub/disable', async (c) => {
  const targetSub = c.req.param('sub');
  const callerSub = c.get('callerSub');

  if (targetSub === callerSub) {
    return c.json({ error: 'You cannot disable your own account' }, 403);
  }

  const target = await userStore.getUserBySub(targetSub);
  if (!target) return c.json({ error: 'User not found' }, 404);

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    return c.json(
      { error: 'Server misconfiguration: COGNITO_USER_POOL_ID not set' },
      500,
    );
  }

  const { AdminDisableUserCommand } = await import(
    '@aws-sdk/client-cognito-identity-provider'
  );
  const cognito = getCognitoClient();

  try {
    await cognito.send(
      new AdminDisableUserCommand({
        UserPoolId: userPoolId,
        Username: target.email,
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'UserNotFoundException') {
      return c.json({ error: 'User not found in Cognito' }, 404);
    }
    throw err;
  }

  const updated = await userStore.updateEnabled(targetSub, false);
  return jsonWithValidation(c, 'disableAdminUser', 200, {
    sub: updated.sub,
    userId: updated.userId,
    role: updated.role,
    enabled: updated.enabled,
  });
});

adminUsersRouter.post('/:sub/enable', async (c) => {
  const targetSub = c.req.param('sub');

  const target = await userStore.getUserBySub(targetSub);
  if (!target) return c.json({ error: 'User not found' }, 404);

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    return c.json(
      { error: 'Server misconfiguration: COGNITO_USER_POOL_ID not set' },
      500,
    );
  }

  const { AdminEnableUserCommand } = await import(
    '@aws-sdk/client-cognito-identity-provider'
  );
  const cognito = getCognitoClient();

  try {
    await cognito.send(
      new AdminEnableUserCommand({
        UserPoolId: userPoolId,
        Username: target.email,
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'UserNotFoundException') {
      return c.json({ error: 'User not found in Cognito' }, 404);
    }
    throw err;
  }

  const updated = await userStore.updateEnabled(targetSub, true);
  return jsonWithValidation(c, 'enableAdminUser', 200, {
    sub: updated.sub,
    userId: updated.userId,
    role: updated.role,
    enabled: updated.enabled,
  });
});

adminUsersRouter.post('/:sub/resend-invite', async (c) => {
  const targetSub = c.req.param('sub');

  const target = await userStore.getUserBySub(targetSub);
  if (!target) return c.json({ error: 'User not found' }, 404);

  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) {
    return c.json(
      { error: 'Server misconfiguration: COGNITO_USER_POOL_ID not set' },
      500,
    );
  }

  const { AdminCreateUserCommand } = await import(
    '@aws-sdk/client-cognito-identity-provider'
  );
  const cognito = getCognitoClient();

  try {
    await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: target.email,
        MessageAction: 'RESEND',
      }),
    );
  } catch (err) {
    const errName = (err as { name?: string }).name;
    if (errName === 'UserNotFoundException') {
      return c.json({ error: 'User not found in Cognito' }, 404);
    }
    if (errName === 'UnsupportedUserStateException') {
      return c.json(
        { error: 'User has already activated their account and cannot be re-invited' },
        400,
      );
    }
    throw err;
  }

  return jsonWithValidation(c, 'resendAdminUserInvite', 200, {
    sub: target.sub,
    userId: target.userId,
    role: target.role,
    enabled: target.enabled,
  });
});

export { adminUsersRouter };
