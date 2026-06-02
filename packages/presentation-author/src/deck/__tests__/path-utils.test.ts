import { describe, expect, it } from 'vitest';
import { isWithinDir } from '../path-utils.js';

describe('isWithinDir', () => {
  it('accepts a path inside the directory', () => {
    expect(isWithinDir('/out/deck.svg', '/out')).toBe(true);
    expect(isWithinDir('/out/sub/deck.svg', '/out')).toBe(true);
  });

  it('accepts the directory itself', () => {
    expect(isWithinDir('/out', '/out')).toBe(true);
  });

  it('rejects a sibling that shares a name prefix (the startsWith trap)', () => {
    expect(isWithinDir('/out-evil/secrets', '/out')).toBe(false);
  });

  it('rejects paths outside and traversal escapes', () => {
    expect(isWithinDir('/etc/passwd', '/out')).toBe(false);
    expect(isWithinDir('/out/../etc/passwd', '/out')).toBe(false);
  });
});
