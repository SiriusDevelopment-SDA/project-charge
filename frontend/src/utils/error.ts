type ApiErrorPayload = {
  message?: string | string[];
};

type ErrorWithResponse = {
  response?: {
    status?: number;
    data?: ApiErrorPayload;
  };
};

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asErrorWithResponse(error: unknown): ErrorWithResponse | null {
  if (!isObjectLike(error)) return null;
  return error as ErrorWithResponse;
}

export function getErrorStatus(error: unknown): number | undefined {
  return asErrorWithResponse(error)?.response?.status;
}

export function getErrorMessage(
  error: unknown,
  fallback = "Ocorreu um erro inesperado."
): string {
  const responseMessage = asErrorWithResponse(error)?.response?.data?.message;
  if (typeof responseMessage === "string" && responseMessage.trim()) {
    return responseMessage;
  }
  if (Array.isArray(responseMessage) && responseMessage.length > 0) {
    return String(responseMessage[0] ?? fallback);
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

