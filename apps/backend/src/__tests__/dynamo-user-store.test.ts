import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DynamoUserStore } from '../store/user-store.js';

// `MemoryUserStore` never exercises DynamoDB expressions, so these tests guard
// the reserved-word aliasing that a live /admin/users call against DynamoDB
// depends on. `sub` and `role` are DynamoDB reserved words and MUST be aliased
// in any ProjectionExpression / ConditionExpression / UpdateExpression.
//
// A bare reserved word (e.g. `sub`, not `#sub`) triggers:
//   ValidationException: Invalid ProjectionExpression: Attribute name is a
//   reserved keyword; reserved keyword: sub

// Matches a standalone `sub` that is neither an alias (`#sub`) nor a value
// placeholder (`:sub`) — i.e. an unaliased reserved attribute reference.
const BARE_SUB = /(?<![#:])\bsub\b/;
// Same for the reserved word `role`.
const BARE_ROLE = /(?<![#:])\brole\b/;

type MockSend = ReturnType<typeof vi.fn>;

function storeWithMock(sendImpl: (command: unknown) => Promise<unknown>): {
  store: DynamoUserStore;
  send: MockSend;
} {
  const store = new DynamoUserStore();
  const send = vi.fn(sendImpl);
  // Replace the private client with a mock that records command inputs.
  (store as unknown as { client: { send: MockSend } }).client = { send };
  return { store, send };
}

// biome-ignore lint/suspicious/noExplicitAny: reading recorded SDK command input
function inputOf(send: MockSend, call = 0): any {
  return (send.mock.calls[call] as unknown[])[0] as { input: unknown };
}

describe('DynamoUserStore — DynamoDB reserved-word aliasing', () => {
  beforeEach(() => {
    process.env.USERS_TABLE_NAME = 'test-users-table';
  });

  afterEach(() => {
    delete process.env.USERS_TABLE_NAME;
  });

  it('listUsers aliases reserved words sub and role in the ProjectionExpression', async () => {
    const { store, send } = storeWithMock(async () => ({
      Items: [],
      LastEvaluatedKey: undefined,
    }));

    await store.listUsers();

    const { input } = inputOf(send);
    expect(input.ProjectionExpression).toContain('#sub');
    expect(input.ProjectionExpression).not.toMatch(BARE_SUB);
    expect(input.ProjectionExpression).not.toMatch(BARE_ROLE);
    expect(input.ExpressionAttributeNames['#sub']).toBe('sub');
    expect(input.ExpressionAttributeNames['#role']).toBe('role');
    expect(input.ProjectionExpression).toContain('displayName');
  });

  it('createInvitedUser aliases sub in the ConditionExpression', async () => {
    const { store, send } = storeWithMock(async () => ({}));

    await store.createInvitedUser('sub-1', 'a@b.com', 'user', 'Alice');

    const { input } = inputOf(send);
    expect(input.ConditionExpression).not.toMatch(BARE_SUB);
    expect(input.ConditionExpression).toContain('#sub');
    expect(input.ExpressionAttributeNames['#sub']).toBe('sub');
    // displayName is stored when provided
    expect(input.Item.displayName).toBe('Alice');
  });

  it('updateRole aliases sub and role in its expressions', async () => {
    const { store, send } = storeWithMock(async () => ({
      Attributes: {
        userId: 'u1',
        sub: 'sub-1',
        email: 'a@b.com',
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'admin',
        enabled: true,
      },
    }));

    await store.updateRole('sub-1', 'admin');

    const { input } = inputOf(send);
    expect(input.ConditionExpression).not.toMatch(BARE_SUB);
    expect(input.UpdateExpression).not.toMatch(BARE_ROLE);
    expect(input.ExpressionAttributeNames['#sub']).toBe('sub');
    expect(input.ExpressionAttributeNames['#role']).toBe('role');
  });

  it('updateEnabled aliases sub in the ConditionExpression', async () => {
    const { store, send } = storeWithMock(async () => ({
      Attributes: {
        userId: 'u1',
        sub: 'sub-1',
        email: 'a@b.com',
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'user',
        enabled: false,
      },
    }));

    await store.updateEnabled('sub-1', false);

    const { input } = inputOf(send);
    expect(input.ConditionExpression).not.toMatch(BARE_SUB);
    expect(input.ExpressionAttributeNames['#sub']).toBe('sub');
  });

  it('getOrCreateUser update path never references a bare reserved word', async () => {
    // Existing record with a stale role triggers an UpdateCommand.
    const send = vi.fn();
    send
      .mockResolvedValueOnce({
        Item: {
          userId: 'u1',
          sub: 'sub-1',
          email: 'a@b.com',
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'user',
          enabled: true,
        },
      })
      .mockResolvedValueOnce({});
    const store = new DynamoUserStore();
    (store as unknown as { client: { send: MockSend } }).client = { send };

    await store.getOrCreateUser('sub-1', 'a@b.com', ['agentra-admin'], {
      name: 'Alice',
    });

    const updateInput = inputOf(send, 1).input;
    expect(updateInput.UpdateExpression).not.toMatch(BARE_ROLE);
    expect(updateInput.ExpressionAttributeNames['#role']).toBe('role');
    // displayName/email are not reserved words and are set directly.
    expect(updateInput.UpdateExpression).toContain('displayName');
  });
});
