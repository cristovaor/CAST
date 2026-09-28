import i18n from '@/i18n';

// ─── API Client ───────────────────────────────────────────────
// Typed fetch wrapper. Base URL from env or localhost default.
// Auth header injection prepared for JWT.

export const API_BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8080/api/v1';

export const AUTH_TOKEN_KEY = 'cast_token';

interface RequestOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skips the global 401 redirect (used by the login request itself). */
  skipAuthRedirect?: boolean;
}

/** Thrown on any non-2xx response; carries the HTTP status for callers. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * Central handler for an expired/invalid session. Clears the token and sends
 * the user to /login once, preserving where they were so they can return.
 * Without this, expiry only surfaced on the next route change and in-flight
 * requests failed with an opaque error.
 */
let redirecting = false;
function handleUnauthorized() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  if (redirecting) return;
  if (window.location.pathname.startsWith('/login')) return;
  redirecting = true;
  const from = window.location.pathname + window.location.search;
  window.location.assign(`/login?from=${encodeURIComponent(from)}`);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let finalBody: BodyInit | undefined;
  if (body !== undefined) {
    if (headers['Content-Type'] === 'application/x-www-form-urlencoded') {
      finalBody = new URLSearchParams(body as Record<string, string>).toString();
    } else if (headers['Content-Type'] === 'application/json') {
      finalBody = JSON.stringify(body);
    } else {
      finalBody = body as BodyInit;
    }
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: finalBody,
    signal: options.signal,
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const err = await res.json() as { detail?: string; message?: string };
      message = err.detail ?? err.message ?? message;
    } catch {
      // ignore parse errors
    }

    // An expired or revoked token invalidates every in-flight request, so the
    // session is torn down here rather than at the next route change.
    if (res.status === 401 && !options.skipAuthRedirect) {
      handleUnauthorized();
      throw new ApiError(i18n.t('common:errors.sessionExpired'), 401);
    }

    throw new ApiError(message, res.status);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>('GET', path, undefined, options),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),

  /** `body` carries the confirmation of the permanent-deletion endpoints. */
  delete: <T>(path: string, options?: RequestOptions & { body?: unknown }) =>
    request<T>('DELETE', path, options?.body, options),
};

export async function uploadApiForm<T>(path: string, formData: FormData): Promise<T> {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: formData,
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const error = await response.json() as { detail?: string | { message?: string } };
      message = typeof error.detail === 'string'
        ? error.detail
        : (error.detail?.message ?? message);
    } catch {
      // Keep the HTTP fallback for non-JSON responses.
    }
    if (response.status === 401) {
      handleUnauthorized();
      throw new ApiError(i18n.t('common:errors.sessionExpired'), 401);
    }
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export async function downloadApiFile(path: string, fallbackName: string) {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const error = await response.json() as { detail?: string };
      message = error.detail ?? message;
    } catch {
      // Keep the HTTP fallback when the response is not JSON.
    }
    if (response.status === 401) {
      handleUnauthorized();
      throw new ApiError(i18n.t('common:errors.sessionExpired'), 401);
    }
    throw new ApiError(message, response.status);
  }

  const disposition = response.headers.get('Content-Disposition') ?? '';
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plain = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = encoded ? decodeURIComponent(encoded) : (plain ?? fallbackName);
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
