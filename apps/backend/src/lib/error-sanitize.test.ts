import { describe, expect, it } from 'vitest';
import { sanitizeErrorMessage, sanitizeErrorStack } from './error-sanitize.js';

describe('sanitizeErrorMessage', () => {
  it('redacts API keys', () => {
    const message = 'Failed with api_key=secret123abc';
    const result = sanitizeErrorMessage(message);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('secret123abc');
  });

  it('redacts secrets', () => {
    const message = 'Authentication failed: secret=my-secret-value';
    const result = sanitizeErrorMessage(message);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('my-secret-value');
  });

  it('redacts passwords', () => {
    const message = 'Database error: password=p@ssw0rd123';
    const result = sanitizeErrorMessage(message);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('p@ssw0rd123');
  });

  it('redacts tokens', () => {
    const message = 'Token validation failed: token=eyJhbGc...';
    const result = sanitizeErrorMessage(message);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('eyJhbGc');
  });

  it('redacts Bearer tokens', () => {
    const message = 'Unauthorized: Bearer token_abc123def456';
    const result = sanitizeErrorMessage(message);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('token_abc123def456');
  });

  it('redacts AWS secret access keys', () => {
    const message = 'AWS error: AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG';
    const result = sanitizeErrorMessage(message);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('wJalrXUtnFEMI');
  });

  it('redacts authorization headers', () => {
    const message =
      'Authorization header invalid: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const result = sanitizeErrorMessage(message);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('handles multiple sensitive patterns in one message', () => {
    const message = 'Failed with api_key=key123 and password=pass456 and token=tok789';
    const result = sanitizeErrorMessage(message);
    expect((result.match(/\[REDACTED\]/g) || []).length).toBe(3);
    expect(result).not.toContain('key123');
    expect(result).not.toContain('pass456');
    expect(result).not.toContain('tok789');
  });

  it('truncates at maxLength', () => {
    const longMessage = 'Error: ' + 'a'.repeat(500);
    const result = sanitizeErrorMessage(longMessage, 100);
    expect(result.length).toBe(100);
  });

  it('respects custom maxLength', () => {
    const message = 'This is a test error message';
    const result = sanitizeErrorMessage(message, 10);
    expect(result.length).toBe(10);
    expect(result).toBe('This is a ');
  });

  it('handles empty string', () => {
    const result = sanitizeErrorMessage('');
    expect(result).toBe('');
  });

  it('handles message with no sensitive content', () => {
    const message = 'Connection timeout after 30 seconds';
    const result = sanitizeErrorMessage(message);
    expect(result).toBe(message);
  });

  it('handles case-insensitive patterns', () => {
    const message = 'Error with API_KEY=mykey and Secret=mysecret';
    const result = sanitizeErrorMessage(message);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('mykey');
    expect(result).not.toContain('mysecret');
  });

  it('handles patterns with colons', () => {
    const message = 'Config error: api-key:secret123';
    const result = sanitizeErrorMessage(message);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('secret123');
  });

  it('handles patterns with equals signs', () => {
    const message = 'Init failed: token=abc123def456ghi';
    const result = sanitizeErrorMessage(message);
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('abc123def456ghi');
  });

  it('limits redaction to word boundaries', () => {
    const message = 'The password_reset function failed';
    const result = sanitizeErrorMessage(message);
    expect(result).not.toContain('[REDACTED]');
    expect(result).toContain('password_reset');
  });
});

describe('sanitizeErrorStack', () => {
  it('returns undefined for undefined stack', () => {
    const result = sanitizeErrorStack(undefined);
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty stack', () => {
    const result = sanitizeErrorStack('');
    expect(result).toBeUndefined();
  });

  it('redacts API keys in stack traces', () => {
    const stack =
      'Error: Failed\n  at func (file.js:10)\n  api_key=secret123\n  at caller (file.js:20)';
    const result = sanitizeErrorStack(stack);
    expect(result).toBeDefined();
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('secret123');
  });

  it('redacts sensitive data in stack traces', () => {
    const stack = 'Error: DB connection failed\n  Bearer token_xyz789\n  at func';
    const result = sanitizeErrorStack(stack);
    expect(result).toBeDefined();
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('token_xyz789');
  });

  it('truncates at maxLength', () => {
    const stack = 'Error: Something\n' + 'a'.repeat(500);
    const result = sanitizeErrorStack(stack, 50);
    expect(result).toBeDefined();
    expect(result!.length).toBe(50);
  });

  it('respects custom maxLength', () => {
    const stack = 'Error: Connection failed\n  at func (file.js:10)';
    const result = sanitizeErrorStack(stack, 20);
    expect(result).toBeDefined();
    expect(result!.length).toBe(20);
  });

  it('preserves stack trace structure', () => {
    const stack = 'Error: Test error\n  at func1 (file.js:10)\n  at func2 (file.js:20)';
    const result = sanitizeErrorStack(stack);
    expect(result).toBeDefined();
    expect(result).toContain('Error:');
    expect(result).toContain('at func1');
    expect(result).toContain('at func2');
  });

  it('handles stack with multiple sensitive values', () => {
    const stack =
      'Error: Failed\n  password=pass123\n  token=tok456\n  at func (file.js:10)';
    const result = sanitizeErrorStack(stack);
    expect(result).toBeDefined();
    expect((result!.match(/\[REDACTED\]/g) || []).length).toBe(2);
    expect(result).not.toContain('pass123');
    expect(result).not.toContain('tok456');
  });
});
