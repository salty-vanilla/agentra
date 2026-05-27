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
};

export interface UserStore {
  getOrCreateUser(sub: string, email: string, groups: string[]): Promise<UserRecord>;
  listUsers(): Promise<UserRecord[]>;
  createInvitedUser(sub: string, email: string, role: UserRole): Promise<UserRecord>;
  getUserBySub(sub: string): Promise<UserRecord | null>;
  updateRole(sub: string, role: UserRole): Promise<UserRecord>;
  updateEnabled(sub: string, enabled: boolean): Promise<UserRecord>;
}

export function normalizeUserRecord(item: Record<string, unknown>): UserRecord {
  return {
    userId: String(item.userId),
    sub: String(item.sub),
    email: String(item.email ?? ''),
    createdAt: String(item.createdAt ?? ''),
    role: item.role === 'admin' || item.role === 'user' ? item.role : 'user',
    enabled: item.enabled !== false,
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
  ): Promise<UserRecord> {
    const role = deriveUserRole(groups);

    const existing = await this.client.send(
      new GetCommand({ TableName: getUsersTable(), Key: { sub } }),
    );

    if (existing.Item) {
      const rawRole = existing.Item.role;
      const normalized = normalizeUserRecord(existing.Item as Record<string, unknown>);

      if (!shouldBackfillOrUpdateRole(rawRole, role)) {
        return normalized;
      }
      // Run UpdateCommand: backfill missing/invalid role, or sync changed role
      await this.client.send(
        new UpdateCommand({
          TableName: getUsersTable(),
          Key: { sub },
          UpdateExpression: 'SET #role = :role',
          ExpressionAttributeNames: { '#role': 'role' },
          ExpressionAttributeValues: { ':role': role },
        }),
      );
      return { ...normalized, role };
    }

    const record: UserRecord = {
      sub,
      userId: uuidv7(),
      email,
      createdAt: new Date().toISOString(),
      role,
      enabled: true,
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
          ProjectionExpression: 'userId, sub, email, createdAt, #role, enabled',
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
  ): Promise<UserRecord> {
    const record: UserRecord = {
      sub,
      userId: uuidv7(),
      email,
      createdAt: new Date().toISOString(),
      role,
      enabled: true,
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
  ): Promise<UserRecord> {
    const role = deriveUserRole(groups);
    const existing = this.store.get(sub);

    if (existing) {
      if (existing.role === role) return existing;
      const updated = { ...existing, role };
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
  ): Promise<UserRecord> {
    const record: UserRecord = {
      sub,
      userId: uuidv7(),
      email,
      createdAt: new Date().toISOString(),
      role,
      enabled: true,
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
