export const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export interface AuthUser {
  email: string;
  role: 'admin' | 'staff';
  name?: string;
}
const TOKEN_KEY = 'sealkit.token';
const USER_KEY = 'sealkit.user';

export const auth = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get user(): AuthUser | null {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
    } catch {
      return null;
    }
  },
  set(token: string, user: AuthUser) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* not json */
  }
  const e = body?.error;
  let message = e?.message ?? `Request failed (${res.status})`;
  if (Array.isArray(e?.details) && e.details.length) message += ': ' + e.details.map((d: any) => `${d.path ? d.path + ' ' : ''}${d.message}`).join('; ');
  return new ApiError(res.status, e?.code ?? 'ERROR', message, e?.details);
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData; public?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (!opts.public && auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${API}${path}`, { method: opts.method ?? 'GET', headers, body });
  if (!res.ok) {
    const err = await parseError(res);
    if (res.status === 401 && !opts.public) {
      auth.clear();
      window.dispatchEvent(new Event('sealkit:logout'));
    }
    throw err;
  }
  return (res.status === 204 ? null : await res.json()) as T;
}

/** Fetch a protected binary (e.g. plate photo) and return an object URL. */
export async function blobUrl(path: string): Promise<string> {
  const res = await fetch(`${API}${path}`, { headers: auth.token ? { Authorization: `Bearer ${auth.token}` } : {} });
  if (!res.ok) throw await parseError(res);
  return URL.createObjectURL(await res.blob());
}

export async function downloadFile(path: string, filename: string) {
  const url = await blobUrl(path);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export const assetUrl = (u?: string | null) => (!u ? '' : /^https?:\/\//.test(u) ? u : `${API}${u}`);
export const qs = (o: Record<string, string | number | boolean | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};
export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleString() : '—');
