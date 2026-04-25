import { tool } from '@strands-agents/sdk';
import { z } from 'zod';

type ToolResponse = {
  status: 'success' | 'error';
  content: Array<{ text: string }>;
};

type LocalDate = {
  year: number;
  month: number;
  day: number;
};

type RangeResolution = {
  resolved_start: string;
  resolved_end: string;
  resolved_start_date: string;
  resolved_end_date: string;
  granularity: 'day' | 'week' | 'month' | 'year';
};

type DateResolution = RangeResolution & {
  expression: string;
  timezone: string;
  reference_datetime: string;
  interpretation_note: string;
  requires_clarification: boolean;
  candidates?: Array<{
    label: string;
    resolved_start: string;
    resolved_end: string;
    resolved_start_date: string;
    resolved_end_date: string;
  }>;
};

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
  日曜日: 0,
  日: 0,
  月曜日: 1,
  月: 1,
  火曜日: 2,
  火: 2,
  水曜日: 3,
  水: 3,
  木曜日: 4,
  木: 4,
  金曜日: 5,
  金: 5,
  土曜日: 6,
  土: 6,
};

function success(data: unknown): ToolResponse {
  return {
    status: 'success',
    content: [{ text: JSON.stringify(data) }],
  };
}

function failure(message: string): ToolResponse {
  return {
    status: 'error',
    content: [{ text: message }],
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function getZonedParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((item) => item.type === type);
    if (!part) {
      throw new Error(`Failed to get ${type} part for timezone conversion.`);
    }
    return Number(part.value);
  };

  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour: pick('hour'),
    minute: pick('minute'),
    second: pick('second'),
  };
}

function getWeekday(date: Date, timeZone: string): number {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  })
    .format(date)
    .toLowerCase();

  const map: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };

  const value = map[weekday];
  if (value === undefined) {
    throw new Error(`Failed to resolve weekday for timezone: ${timeZone}`);
  }

  return value;
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 6; i += 1) {
    const current = getZonedParts(new Date(guess), timeZone);
    const desiredMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const currentMs = Date.UTC(
      current.year,
      current.month - 1,
      current.day,
      current.hour,
      current.minute,
      current.second,
    );

    const diff = desiredMs - currentMs;
    if (diff === 0) {
      break;
    }
    guess += diff;
  }

  return new Date(guess);
}

function toDateString(local: LocalDate): string {
  return `${String(local.year).padStart(4, '0')}-${String(local.month).padStart(2, '0')}-${String(
    local.day,
  ).padStart(2, '0')}`;
}

function addDays(local: LocalDate, days: number): LocalDate {
  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function addMonths(local: LocalDate, months: number): LocalDate {
  const next = new Date(Date.UTC(local.year, local.month - 1 + months, local.day));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function addYears(local: LocalDate, years: number): LocalDate {
  const next = new Date(Date.UTC(local.year + years, local.month - 1, local.day));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

function rangeForDay(local: LocalDate, timeZone: string): RangeResolution {
  const start = zonedDateTimeToUtc(local.year, local.month, local.day, 0, 0, 0, timeZone);
  const end = zonedDateTimeToUtc(
    local.year,
    local.month,
    local.day,
    23,
    59,
    59,
    timeZone,
  );
  const date = toDateString(local);

  return {
    resolved_start: start.toISOString(),
    resolved_end: end.toISOString(),
    resolved_start_date: date,
    resolved_end_date: date,
    granularity: 'day',
  };
}

function rangeForWeek(
  local: LocalDate,
  currentWeekday: number,
  timeZone: string,
): RangeResolution {
  const mondayOffset = (currentWeekday + 6) % 7;
  const startLocal = addDays(local, -mondayOffset);
  const endLocal = addDays(startLocal, 6);
  const start = zonedDateTimeToUtc(
    startLocal.year,
    startLocal.month,
    startLocal.day,
    0,
    0,
    0,
    timeZone,
  );
  const end = zonedDateTimeToUtc(
    endLocal.year,
    endLocal.month,
    endLocal.day,
    23,
    59,
    59,
    timeZone,
  );

  return {
    resolved_start: start.toISOString(),
    resolved_end: end.toISOString(),
    resolved_start_date: toDateString(startLocal),
    resolved_end_date: toDateString(endLocal),
    granularity: 'week',
  };
}

function rangeForMonth(local: LocalDate, timeZone: string): RangeResolution {
  const startLocal: LocalDate = { year: local.year, month: local.month, day: 1 };
  const nextMonth = addMonths(startLocal, 1);
  const endLocal = addDays(nextMonth, -1);

  return {
    resolved_start: zonedDateTimeToUtc(
      startLocal.year,
      startLocal.month,
      startLocal.day,
      0,
      0,
      0,
      timeZone,
    ).toISOString(),
    resolved_end: zonedDateTimeToUtc(
      endLocal.year,
      endLocal.month,
      endLocal.day,
      23,
      59,
      59,
      timeZone,
    ).toISOString(),
    resolved_start_date: toDateString(startLocal),
    resolved_end_date: toDateString(endLocal),
    granularity: 'month',
  };
}

function rangeForYear(local: LocalDate, timeZone: string): RangeResolution {
  const startLocal: LocalDate = { year: local.year, month: 1, day: 1 };
  const endLocal: LocalDate = { year: local.year, month: 12, day: 31 };

  return {
    resolved_start: zonedDateTimeToUtc(
      startLocal.year,
      startLocal.month,
      startLocal.day,
      0,
      0,
      0,
      timeZone,
    ).toISOString(),
    resolved_end: zonedDateTimeToUtc(
      endLocal.year,
      endLocal.month,
      endLocal.day,
      23,
      59,
      59,
      timeZone,
    ).toISOString(),
    resolved_start_date: toDateString(startLocal),
    resolved_end_date: toDateString(endLocal),
    granularity: 'year',
  };
}

function parseReferenceDateTime(reference: string | undefined, timeZone: string): Date {
  if (!reference) {
    return new Date();
  }

  const absolute = new Date(reference);
  if (!Number.isNaN(absolute.getTime()) && /(Z|[+-]\d{2}:?\d{2})$/i.test(reference)) {
    return absolute;
  }

  const dateOnlyMatch = reference.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, y, m, d] = dateOnlyMatch;
    return zonedDateTimeToUtc(Number(y), Number(m), Number(d), 0, 0, 0, timeZone);
  }

  const localDateTimeMatch = reference.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (localDateTimeMatch) {
    const [, y, m, d, hh, mm, ss] = localDateTimeMatch;
    return zonedDateTimeToUtc(
      Number(y),
      Number(m),
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss ?? '0'),
      timeZone,
    );
  }

  throw new Error(
    'reference_datetime must be ISO 8601. If timezone is omitted, use YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss.',
  );
}

function resolveWeekdayTarget(
  baseWeekday: number,
  targetWeekday: number,
  mode: 'next' | 'last' | 'this',
) {
  if (mode === 'this') {
    return targetWeekday - baseWeekday;
  }

  if (mode === 'next') {
    const delta = (targetWeekday - baseWeekday + 7) % 7;
    return delta === 0 ? 7 : delta;
  }

  const delta = (baseWeekday - targetWeekday + 7) % 7;
  return delta === 0 ? -7 : -delta;
}

function resolveExpression(
  expression: string,
  reference: Date,
  timeZone: string,
): DateResolution {
  const base = getZonedParts(reference, timeZone);
  const baseLocal: LocalDate = {
    year: base.year,
    month: base.month,
    day: base.day,
  };
  const baseWeekday = getWeekday(reference, timeZone);
  const expr = expression.trim();
  const normalized = expr.toLowerCase();

  const build = (
    range: RangeResolution,
    note: string,
    requiresClarification = false,
    candidates?: DateResolution['candidates'],
  ): DateResolution => ({
    expression,
    timezone: timeZone,
    reference_datetime: reference.toISOString(),
    ...range,
    interpretation_note: note,
    requires_clarification: requiresClarification,
    ...(candidates ? { candidates } : {}),
  });

  if (normalized === 'today' || expr === '今日') {
    return build(
      rangeForDay(baseLocal, timeZone),
      'Interpreted as today in the provided timezone.',
    );
  }
  if (normalized === 'tomorrow' || expr === '明日') {
    return build(
      rangeForDay(addDays(baseLocal, 1), timeZone),
      'Interpreted as tomorrow in the provided timezone.',
    );
  }
  if (normalized === 'yesterday' || expr === '昨日') {
    return build(
      rangeForDay(addDays(baseLocal, -1), timeZone),
      'Interpreted as yesterday in the provided timezone.',
    );
  }

  if (normalized === 'this week' || expr === '今週') {
    return build(
      rangeForWeek(baseLocal, baseWeekday, timeZone),
      'Interpreted as the current week (Monday-Sunday) in the provided timezone.',
    );
  }
  if (normalized === 'next week' || expr === '来週') {
    const nextWeekLocal = addDays(baseLocal, 7);
    const nextWeekday = (baseWeekday + 7) % 7;
    return build(
      rangeForWeek(nextWeekLocal, nextWeekday, timeZone),
      'Interpreted as next week (Monday-Sunday) in the provided timezone.',
    );
  }
  if (normalized === 'last week' || expr === '先週') {
    const lastWeekLocal = addDays(baseLocal, -7);
    const lastWeekday = (baseWeekday + 7) % 7;
    return build(
      rangeForWeek(lastWeekLocal, lastWeekday, timeZone),
      'Interpreted as last week (Monday-Sunday) in the provided timezone.',
    );
  }

  if (normalized === 'this month' || expr === '今月') {
    return build(
      rangeForMonth(baseLocal, timeZone),
      'Interpreted as this month in the provided timezone.',
    );
  }
  if (normalized === 'next month' || expr === '来月') {
    return build(
      rangeForMonth(addMonths(baseLocal, 1), timeZone),
      'Interpreted as next month in the provided timezone.',
    );
  }
  if (normalized === 'last month' || expr === '先月') {
    return build(
      rangeForMonth(addMonths(baseLocal, -1), timeZone),
      'Interpreted as last month in the provided timezone.',
    );
  }

  if (normalized === 'this year' || expr === '今年') {
    return build(
      rangeForYear(baseLocal, timeZone),
      'Interpreted as this year in the provided timezone.',
    );
  }
  if (normalized === 'next year' || expr === '来年') {
    return build(
      rangeForYear(addYears(baseLocal, 1), timeZone),
      'Interpreted as next year in the provided timezone.',
    );
  }
  if (normalized === 'last year' || expr === '去年' || expr === '昨年') {
    return build(
      rangeForYear(addYears(baseLocal, -1), timeZone),
      'Interpreted as last year in the provided timezone.',
    );
  }

  const absoluteDate = expr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (absoluteDate) {
    const [, y, m, d] = absoluteDate;
    const local = { year: Number(y), month: Number(m), day: Number(d) };
    return build(
      rangeForDay(local, timeZone),
      'Interpreted as an explicit calendar date in the provided timezone.',
    );
  }

  const inRelative = normalized.match(
    /^(?:in\s+)?(\d+)\s+(day|days|week|weeks|month|months|year|years)$/,
  );
  if (inRelative) {
    const amount = Number(inRelative[1]);
    const unit = inRelative[2];
    if (!unit) {
      throw new Error('Failed to parse relative date expression.');
    }
    if (unit.startsWith('day')) {
      return build(
        rangeForDay(addDays(baseLocal, amount), timeZone),
        `Interpreted as ${amount} day(s) from reference date.`,
      );
    }
    if (unit.startsWith('week')) {
      return build(
        rangeForWeek(
          addDays(baseLocal, amount * 7),
          (baseWeekday + amount * 7) % 7,
          timeZone,
        ),
        `Interpreted as ${amount} week(s) from reference date.`,
      );
    }
    if (unit.startsWith('month')) {
      return build(
        rangeForMonth(addMonths(baseLocal, amount), timeZone),
        `Interpreted as ${amount} month(s) from reference date.`,
      );
    }
    return build(
      rangeForYear(addYears(baseLocal, amount), timeZone),
      `Interpreted as ${amount} year(s) from reference date.`,
    );
  }

  const agoRelative = normalized.match(
    /^(\d+)\s+(day|days|week|weeks|month|months|year|years)\s+ago$/,
  );
  if (agoRelative) {
    const amount = Number(agoRelative[1]);
    const unit = agoRelative[2];
    if (!unit) {
      throw new Error('Failed to parse relative date expression.');
    }
    if (unit.startsWith('day')) {
      return build(
        rangeForDay(addDays(baseLocal, -amount), timeZone),
        `Interpreted as ${amount} day(s) before reference date.`,
      );
    }
    if (unit.startsWith('week')) {
      return build(
        rangeForWeek(
          addDays(baseLocal, -amount * 7),
          (baseWeekday + 7 - ((amount * 7) % 7)) % 7,
          timeZone,
        ),
        `Interpreted as ${amount} week(s) before reference date.`,
      );
    }
    if (unit.startsWith('month')) {
      return build(
        rangeForMonth(addMonths(baseLocal, -amount), timeZone),
        `Interpreted as ${amount} month(s) before reference date.`,
      );
    }
    return build(
      rangeForYear(addYears(baseLocal, -amount), timeZone),
      `Interpreted as ${amount} year(s) before reference date.`,
    );
  }

  const japaneseRelative = expr.match(
    /^(\d+)\s*(日|週間|週|か月|ヶ月|ヵ月|月|年)\s*(後|前)$/,
  );
  if (japaneseRelative) {
    const amount = Number(japaneseRelative[1]);
    const unit = japaneseRelative[2];
    const direction = japaneseRelative[3] === '後' ? 1 : -1;

    if (unit === '日') {
      return build(
        rangeForDay(addDays(baseLocal, amount * direction), timeZone),
        `「${amount}${unit}${japaneseRelative[3]}」として解釈しました。`,
      );
    }
    if (unit === '週' || unit === '週間') {
      const dayDelta = amount * 7 * direction;
      const weekday = (((baseWeekday + dayDelta) % 7) + 7) % 7;
      return build(
        rangeForWeek(addDays(baseLocal, dayDelta), weekday, timeZone),
        `「${amount}${unit}${japaneseRelative[3]}」として解釈しました。`,
      );
    }
    if (unit === 'か月' || unit === 'ヶ月' || unit === 'ヵ月' || unit === '月') {
      return build(
        rangeForMonth(addMonths(baseLocal, amount * direction), timeZone),
        `「${amount}${unit}${japaneseRelative[3]}」として解釈しました。`,
      );
    }

    return build(
      rangeForYear(addYears(baseLocal, amount * direction), timeZone),
      `「${amount}${unit}${japaneseRelative[3]}」として解釈しました。`,
    );
  }

  const nextLastThisWeekday = normalized.match(/^(next|last|this)\s+([a-z]+)$/);
  if (nextLastThisWeekday) {
    const mode = nextLastThisWeekday[1] as 'next' | 'last' | 'this';
    const weekdayToken = nextLastThisWeekday[2];
    if (!weekdayToken) {
      throw new Error('Failed to parse weekday expression.');
    }
    const target = WEEKDAY_INDEX[weekdayToken];
    if (target !== undefined) {
      const delta = resolveWeekdayTarget(baseWeekday, target, mode);
      return build(
        rangeForDay(addDays(baseLocal, delta), timeZone),
        `Interpreted as ${mode} ${weekdayToken} in the provided timezone.`,
      );
    }
  }

  const jpWeekday = expr.match(
    /^(来週|先週|今週)の?(月曜日|火曜日|水曜日|木曜日|金曜日|土曜日|日曜日|月|火|水|木|金|土|日)$/,
  );
  if (jpWeekday) {
    const scope = jpWeekday[1];
    const weekdayLabel = jpWeekday[2];
    if (!scope || !weekdayLabel) {
      throw new Error('Failed to parse Japanese weekday expression.');
    }
    const target = WEEKDAY_INDEX[weekdayLabel];
    if (target !== undefined) {
      let dayShift = 0;
      if (scope === '来週') {
        dayShift = 7;
      } else if (scope === '先週') {
        dayShift = -7;
      }
      const shiftedBase = addDays(baseLocal, dayShift);
      const shiftedWeekday = (((baseWeekday + dayShift) % 7) + 7) % 7;
      const delta = resolveWeekdayTarget(shiftedWeekday, target, 'this');
      return build(
        rangeForDay(addDays(shiftedBase, delta), timeZone),
        `「${scope}の${weekdayLabel}」として解釈しました。`,
      );
    }
  }

  const plainWeekday = WEEKDAY_INDEX[normalized] ?? WEEKDAY_INDEX[expr];
  if (plainWeekday !== undefined) {
    const upcomingDelta = resolveWeekdayTarget(baseWeekday, plainWeekday, 'next');
    const previousDelta = resolveWeekdayTarget(baseWeekday, plainWeekday, 'last');
    const upcoming = rangeForDay(addDays(baseLocal, upcomingDelta), timeZone);
    const previous = rangeForDay(addDays(baseLocal, previousDelta), timeZone);

    return build(
      upcoming,
      `Weekday-only expression is ambiguous. Defaulted to upcoming ${expr}.`,
      true,
      [
        {
          label: `upcoming ${expr}`,
          resolved_start: upcoming.resolved_start,
          resolved_end: upcoming.resolved_end,
          resolved_start_date: upcoming.resolved_start_date,
          resolved_end_date: upcoming.resolved_end_date,
        },
        {
          label: `previous ${expr}`,
          resolved_start: previous.resolved_start,
          resolved_end: previous.resolved_end,
          resolved_start_date: previous.resolved_start_date,
          resolved_end_date: previous.resolved_end_date,
        },
      ],
    );
  }

  throw new Error(
    'Unsupported date expression. Try examples like "today", "in 3 days", "next friday", "2026-04-25", "来週", "3日後".',
  );
}

const dateResolverTool = tool({
  name: 'date_resolver',
  description:
    'Resolve relative date/time expressions into absolute ISO timestamps and date ranges using a specified timezone.',
  inputSchema: z.object({
    expression: z.string().describe('Relative or absolute date expression to resolve.'),
    timezone: z
      .string()
      .optional()
      .describe(
        'IANA timezone like Asia/Tokyo or America/Los_Angeles. Defaults to runtime timezone.',
      ),
    reference_datetime: z
      .string()
      .optional()
      .describe('Optional ISO reference datetime. If omitted, current time is used.'),
    locale: z
      .string()
      .optional()
      .describe('Optional locale hint. Currently reserved for future use.'),
  }),
  callback: async (input) => {
    try {
      const expression = input.expression.trim();
      if (!expression) {
        return failure('expression is required and cannot be empty');
      }

      const timezone =
        input.timezone?.trim() ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        'UTC';

      try {
        // Validate timezone identifier early.
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
      } catch {
        return failure(`Invalid timezone: ${timezone}`);
      }

      const reference = parseReferenceDateTime(input.reference_datetime, timezone);
      const resolution = resolveExpression(expression, reference, timezone);

      return success(resolution);
    } catch (error) {
      return failure(errorMessage(error));
    }
  },
});

export { dateResolverTool };
