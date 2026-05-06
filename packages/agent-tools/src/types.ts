export type ToolResultStatus = 'success' | 'error';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type SafeRecord = Record<string, JsonValue>;
