import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { uuidv7 } from 'uuidv7';

export type UserRecord = {
  userId: string;
  sub: string;
  email: string;
  createdAt: string;
};

export interface UserStore {
  getOrCreateUser(sub: string, email: string): Promise<UserRecord>;
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

  async getOrCreateUser(sub: string, email: string): Promise<UserRecord> {
    const existing = await this.client.send(
      new GetCommand({ TableName: getUsersTable(), Key: { sub } }),
    );

    if (existing.Item) {
      return existing.Item as UserRecord;
    }

    const record: UserRecord = {
      sub,
      userId: uuidv7(),
      email,
      createdAt: new Date().toISOString(),
    };

    await this.client.send(new PutCommand({ TableName: getUsersTable(), Item: record }));
    return record;
  }
}

// ── Memory implementation (local dev) ────────────────────────────────────────

const DEMO_USER: UserRecord = {
  sub: 'demo-sub',
  userId: 'user-demo-001',
  email: 'demo.user@example.internal',
  createdAt: '2026-04-18T00:00:00.000Z',
};

export class MemoryUserStore implements UserStore {
  private store = new Map<string, UserRecord>([[DEMO_USER.sub, DEMO_USER]]);

  async getOrCreateUser(sub: string, email: string): Promise<UserRecord> {
    const existing = this.store.get(sub);
    if (existing) return existing;

    const record: UserRecord = {
      sub,
      userId: uuidv7(),
      email,
      createdAt: new Date().toISOString(),
    };
    this.store.set(sub, record);
    return record;
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
