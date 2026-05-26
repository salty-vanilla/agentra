const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function parseDateRange(
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

export function parseLimitParam(raw: string | undefined): number | { error: string } {
  const n = raw === undefined ? 50 : Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 200) {
    return { error: "Invalid 'limit': must be an integer between 1 and 200." };
  }
  return n;
}

export function parseCursorParam(
  raw: string | undefined,
): number | undefined | { error: string } {
  if (raw === undefined) return undefined;
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64').toString();
  } catch {
    return { error: "Invalid 'cursor'." };
  }
  if (!/^\d+$/.test(decoded)) {
    return { error: "Invalid 'cursor'." };
  }
  return Number(decoded);
}

export function applyOffsetPagination<T>(
  items: T[],
  limit: number,
  offset: number,
): { page: T[]; nextCursor?: string } {
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const nextCursor =
    nextOffset < items.length
      ? Buffer.from(String(nextOffset)).toString('base64')
      : undefined;
  return nextCursor !== undefined ? { page, nextCursor } : { page };
}
