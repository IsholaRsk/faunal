'use client';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = 'error', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * The only network boundary used by client components. Same-origin relative
 * URLs (no localhost assumptions), JSON or FormData, typed errors.
 */
export async function api<T = Record<string, unknown>>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const init: RequestInit & { headers: Record<string, string> } = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(`/api/${path.replace(/^\//, '')}`, init);
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const err = (data?.error ?? {}) as { message?: string; code?: string };
    throw new ApiError(err.message ?? `Request failed (${res.status})`, err.code ?? 'ERROR', res.status);
  }
  return data as T;
}

export const post = <T = Record<string, unknown>>(path: string, body?: unknown) => api<T>('POST', path, body);
export const patch = <T = Record<string, unknown>>(path: string, body?: unknown) => api<T>('PATCH', path, body);
export const del = <T = Record<string, unknown>>(path: string) => api<T>('DELETE', path);
export const get = <T = Record<string, unknown>>(path: string) => api<T>('GET', path);
