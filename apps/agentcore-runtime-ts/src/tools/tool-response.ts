export type ToolResponse = {
  status: 'success' | 'error';
  content: Array<{ text: string }>;
};

export function toolSuccess(data: unknown): ToolResponse {
  return {
    status: 'success',
    content: [{ text: JSON.stringify(data) }],
  };
}

export function toolFailure(message: string): ToolResponse {
  return {
    status: 'error',
    content: [{ text: message }],
  };
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
