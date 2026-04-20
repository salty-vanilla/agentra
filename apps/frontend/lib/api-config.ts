const fallbackApiMode = process.env.NODE_ENV === 'development' ? 'mock' : 'real';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8787';
export const API_MODE = process.env.NEXT_PUBLIC_API_MODE ?? fallbackApiMode;
export const isMockApiMode = API_MODE === 'mock';
