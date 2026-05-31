import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { uuidv7 } from 'uuidv7';
import { deriveUserRole, type UserRole } from '../lib/user-role.js';

export type UserRecord = {
  userId: string;
  sub: string;
  email: string;
  createdAt: string;
  role: UserRole;
  enabled: boolean;
  // Human-readable display label, projected from Cognito profile claims.
  // Absent for pre-existing records that have never been synced.
  displayName?: string;
};

// Profile claims available at authentication time (from the verified token).
// Used to project a human-readable displayName into the UserTable.
export type UserProfileClaims = {
  name?: string | undefined;
  preferredUsername?: string | undefined;
};

export interface UserStore {
  getOrCreateUser(
    sub: string,
    email: string,
    groups: string[],
    profile?: UserProfileClaims,
  ): Promise<UserRecord>;
  listUsers(): Promise<UserRecord[]>;
  createInvitedUser(
    sub: string,
    email: string,
    role: UserRole,
    displayName?: string,
  ): Promise<UserRecord>;
  getUserBySub(sub: string): Promise<UserRecord | null>;
  updateRole(sub: string, role: UserRole): Promise<UserRecord>;
  updateEnabled(sub: string, enabled: boolean): Promise<UserRecord>;
}

// Derive the display label from profile claims.
// Priority: name > preferred_username. Empty/whitespace values are ignored so a
// blank claim never overwrites or stores a meaningless displayName.
export function deriveDisplayName(profile?: UserProfileClaims): string | undefined {
  const name = profile?.name?.trim();
  if (name) return name;
  const preferred = profile?.preferredUsername?.trim();
  if (preferred) return preferred;
  return undefined;
}

export type ProfileSync = {
  displayName?: string;
  email?: string;
};

// Compute which profile fields differ from the stored record and should be
// written back. Only non-empty, changed values are included.
export function computeProfileSync(
  existing: UserRecord,
  claimEmail: string,
  derivedDisplayName: string | undefined,
): ProfileSync {
  const updates: ProfileSync = {};
  if (derivedDisplayName && derivedDisplayName !== existing.displayName) {
    updates.displayName = derivedDisplayName;
  }
  const trimmedEmail = claimEmail.trim();
  if (trimmedEmail && trimmedEmail !== existing.email) {
    updates.email = trimmedEmail;
  }
  return updates;
}

export function normalizeUserRecord(item: Record<string, unknown>): UserRecord {
  const rawDisplayName =
    typeof item.displayName === 'string' ? item.displayName.trim() : '';
  return {
    userId: String(item.userId),
    sub: String(item.sub),
    email: String(item.email ?? ''),
    createdAt: String(item.createdAt ?? ''),
    role: item.role === 'admin' || item.role === 'user' ? item.role : 'user',
    enabled: item.enabled !== false,
    ...(rawDisplayName ? { displayName: rawDisplayName } : {}),
  };
}

// Returns true when the stored role requires an UpdateCommand:
// - raw role is missing or invalid (backfill needed)
// - raw role is valid but differs from the derived role (sync needed)
export function shouldBackfillOrUpdateRole(
  rawRole: unknown,
  derivedRole: UserRole,
): boolean {
  return rawRole !== 'admin' && rawRole !== 'user' ? true : rawRole !== derivedRole;
}

// ── DynamoDB implementation ──────────────────────────────────────────────────

function getUsersTable(): string {
  const name = process.env.USERS_TABLE_NAME;
  if (!name) throw new Error('USERS_TABLE_NAME environment variable is not set');
  return name;
}

export class DynamoUserStore implements UserStore {
  private client: DynamoDBDocumentClient;

  constructor() {
    this.client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  }

  async getOrCreateUser(
    sub: string,
    email: string,
    groups: string[],
    profile?: UserProfileClaims,
  ): Promise<UserRecord> {
    const role = deriveUserRole(groups);
    const derivedDisplayName = deriveDisplayName(profile);

    const existing = await this.client.send(
      new GetCommand({ TableName: getUsersTable(), Key: { sub } }),
    );

    if (existing.Item) {
      const rawRole = existing.Item.role;
      const normalized = normalizeUserRecord(existing.Item as Record<string, unknown>);
      const roleNeedsUpdate = shouldBackfillOrUpdateRole(rawRole, role);
      const profileSync = computeProfileSync(normalized, email, derivedDisplayName);

      if (!roleNeedsUpdate && !profileSync.displayName && !profileSync.email) {
        return normalized;
      }

      // Coalesce role backfill/sync and profile sync into a single UpdateCommand.
      const setClauses: string[] = [];
      const names: Record<string, string> = {};
      const values: Record<string, unknown> = {};
      if (roleNeedsUpdate) {
        setClauses.push('#role = :role');
        names['#role'] = 'role';
        values[':role'] = role;
      }
      if (profileSync.displayName) {
        setClauses.push('displayName = :displayName');
        values[':displayName'] = profileSync.displayName;
      }
      if (profileSync.email) {
        setClauses.push('email = :email');
        values[':email'] = profileSync.email;
      }

      await this.client.send(
        new UpdateCommand({
          TableName: getUsersTable(),
          Key: { sub },
          UpdateExpression: `SET ${setClauses.join(', ')}`,
          ...(Object.keys(names).length > 0 ? { ExpressionAttributeNames: names } : {}),
          ExpressionAttributeValues: values,
        }),
      );

      return {
        ...normalized,
        ...(roleNeedsUpdate ? { role } : {}),
        ...(profileSync.displayName ? { displayName: profileSync.displayName } : {}),
        ...(profileSync.email ? { email: profileSync.email } : {}),
      };
    }

    const record: UserRecord = {
      sub,
      userId: uuidv7(),
      email,
      createdAt: new Date().toISOString(),
      role,
      enabled: true,
      ...(derivedDisplayName ? { displayName: derivedDisplayName } : {}),
    };

    await this.client.send(new PutCommand({ TableName: getUsersTable(), Item: record }));
    return record;
  }

  async listUsers(): Promise<UserRecord[]> {
    const items: Record<string, unknown>[] = [];
    let lastKey: Record<string, unknown> | undefined;

    do {
      const result = await this.client.send(
        new ScanCommand({
          TableName: getUsersTable(),
          ProjectionExpression:
            'userId, sub, email, createdAt, #role, enabled, displayName',
          ExpressionAttributeNames: { '#role': 'role' },
          ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
        }),
      );
      items.push(...((result.Items ?? []) as Record<string, unknown>[]));
      lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (lastKey !== undefined);

    return items.map(normalizeUserRecord);
  }

  async createInvitedUser(
    sub: string,
    email: string,
    role: UserRole,
    displayName?: string,
  ): Promise<UserRecord> {
    const trimmedDisplayName = displayName?.trim();
    const record: UserRecord = {
      sub,
      userId: uuidv7(),
      email,
      createdAt: new Date().toISOString(),
      role,
      enabled: true,
      ...(trimmedDisplayName ? { displayName: trimmedDisplayName } : {}),
    };
    await this.client.send(
      new PutCommand({
        TableName: getUsersTable(),
        Item: record,
        ConditionExpression: 'attribute_not_exists(sub)',
      }),
    );
    return record;
  }

  async getUserBySub(sub: string): Promise<UserRecord | null> {
    const result = await this.client.send(
      new GetCommand({ TableName: getUsersTable(), Key: { sub } }),
    );
    if (!result.Item) return null;
    return normalizeUserRecord(result.Item as Record<string, unknown>);
  }

  async updateRole(sub: string, role: UserRole): Promise<UserRecord> {
    const result = await this.client.send(
      new UpdateCommand({
        TableName: getUsersTable(),
        Key: { sub },
        ConditionExpression: 'attribute_exists(sub)',
        UpdateExpression: 'SET #role = :role',
        ExpressionAttributeNames: { '#role': 'role' },
        ExpressionAttributeValues: { ':role': role },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return normalizeUserRecord(result.Attributes as Record<string, unknown>);
  }

  async updateEnabled(sub: string, enabled: boolean): Promise<UserRecord> {
    const result = await this.client.send(
      new UpdateCommand({
        TableName: getUsersTable(),
        Key: { sub },
        ConditionExpression: 'attribute_exists(sub)',
        UpdateExpression: 'SET enabled = :enabled',
        ExpressionAttributeValues: { ':enabled': enabled },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return normalizeUserRecord(result.Attributes as Record<string, unknown>);
  }
}

// ── Memory implementation (local dev) ────────────────────────────────────────

const DEMO_USER: UserRecord = {
  sub: 'demo-sub',
  userId: 'user-demo-001',
  email: 'demo.user@example.internal',
  createdAt: '2026-04-18T00:00:00.000Z',
  role: 'user',
  enabled: true,
  displayName: 'Demo User',
};

export class MemoryUserStore implements UserStore {
  private store = new Map<string, UserRecord>([[DEMO_USER.sub, DEMO_USER]]);

  reset(): void {
    this.store = new Map([[DEMO_USER.sub, { ...DEMO_USER }]]);
  }

  async getOrCreateUser(
    sub: string,
    email: string,
    groups: string[],
    profile?: UserProfileClaims,
  ): Promise<UserRecord> {
    const role = deriveUserRole(groups);
    const derivedDisplayName = deriveDisplayName(profile);
    const existing = this.store.get(sub);

    if (existing) {
      const profileSync = computeProfileSync(existing, email, derivedDisplayName);
      if (existing.role === role && !profileSync.displayName && !profileSync.email) {
        return existing;
      }
      const updated: UserRecord = {
        ...existing,
        role,
        ...(profileSync.displayName ? { displayName: profileSync.displayName } : {}),
        ...(profileSync.email ? { email: profileSync.email } : {}),
      };
      this.store.set(sub, updated);
      return updated;
    }

    const record: UserRecord = {
      sub,
      userId: uuidv7(),
      email,
      createdAt: new Date().toISOString(),
      role,
      enabled: true,
      ...(derivedDisplayName ? { displayName: derivedDisplayName } : {}),
    };
    this.store.set(sub, record);
    return record;
  }

  async listUsers(): Promise<UserRecord[]> {
    return Array.from(this.store.values());
  }

  async createInvitedUser(
    sub: string,
    email: string,
    role: UserRole,
    displayName?: string,
  ): Promise<UserRecord> {
    const trimmedDisplayName = displayName?.trim();
    const record: UserRecord = {
      sub,
      userId: uuidv7(),
      email,
      createdAt: new Date().toISOString(),
      role,
      enabled: true,
      ...(trimmedDisplayName ? { displayName: trimmedDisplayName } : {}),
    };
    this.store.set(sub, record);
    return record;
  }

  async getUserBySub(sub: string): Promise<UserRecord | null> {
    return this.store.get(sub) ?? null;
  }

  async updateRole(sub: string, role: UserRole): Promise<UserRecord> {
    const existing = this.store.get(sub);
    if (!existing) throw new Error(`User not found: ${sub}`);
    const updated = { ...existing, role };
    this.store.set(sub, updated);
    return updated;
  }

  async updateEnabled(sub: string, enabled: boolean): Promise<UserRecord> {
    const existing = this.store.get(sub);
    if (!existing) throw new Error(`User not found: ${sub}`);
    const updated = { ...existing, enabled };
    this.store.set(sub, updated);
    return updated;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

function createUserStore(): UserStore {
  if (process.env.STORE_TYPE === 'dynamo') {
    return new DynamoUserStore();
  }
  return new MemoryUserStore();
}

export const userStore: UserStore = createUserStore();

export function resetUserStore(): void {
  if (userStore instanceof MemoryUserStore) {
    (userStore as MemoryUserStore).reset();
  }
}
