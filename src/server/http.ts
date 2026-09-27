import type { ApiResponse } from "./contracts";

export const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
} as const;

export function jsonResponse<T>(status: number, body: ApiResponse<T>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

export function requestId(): string {
  return crypto.randomUUID();
}

export function genericError(status: number, code: string, id = requestId()): Response {
  return jsonResponse(status, {
    ok: false,
    error: "The request could not be completed.",
    code,
    requestId: id,
  });
}
