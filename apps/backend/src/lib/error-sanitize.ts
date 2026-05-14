const SENSITIVE_PATTERNS = [
  /api[_-]?key\s*[=:]\s*[^\s]*/gi,
  /secret\s*[=:]\s*[^\s]*/gi,
  /password\s*[=:]\s*[^\s]*/gi,
  /token\s*[=:]\s*[^\s]*/gi,
  /authorization\s*[=:]\s*[^\s]*/gi,
  /aws[_-]?secret[_-]?access[_-]?key\s*[=:]\s*[^\s]*/gi,
  /Bearer\s+[^\s]*/gi,
];

export function sanitizeErrorMessage(message: string, maxLength: number = 500): string {
  let sanitized = message;

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  return sanitized.slice(0, maxLength);
}

export function sanitizeErrorStack(
  stack: string | undefined,
  maxLength: number = 500,
): string | undefined {
  if (!stack) return undefined;

  let sanitized = stack;

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }

  return sanitized.slice(0, maxLength);
}
