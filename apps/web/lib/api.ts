export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `Request failed with ${status}`);
    this.name = 'ApiError';
  }
}

type Options = Omit<RequestInit, 'body' | 'credentials'> & { body?: unknown };

/**
 * Typed fetch wrapper. Always calls a relative /api path on the same origin and sends the
 * session cookie. `path` is relative to /api, e.g. api('/me').
 * 401 -> /login, 403 -> /no-access (browser only).
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { body, headers, ...rest } = options;
  const res = await fetch(`/api${path.startsWith('/') ? path : `/${path}`}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? safeJson(text) : undefined;

  if (!res.ok) {
    if (typeof window !== 'undefined' && !path.startsWith('/auth/login')) {
      if (res.status === 401 && window.location.pathname !== '/login') {
        window.location.assign('/login');
      } else if (res.status === 403 && window.location.pathname !== '/no-access') {
        window.location.assign('/no-access');
      }
    }
    throw new ApiError(res.status, data);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
