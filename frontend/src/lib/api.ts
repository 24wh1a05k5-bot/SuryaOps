import { uid } from "./utils";

export const API_BASE = "/api/v1";

export class ApiError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;
  requestId?: string;
  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}, requestId?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;
const connectionListeners = new Set<(online: boolean) => void>();

export const auth = {
  setToken(t: string | null) { token = t; },
  getToken() { return token; },
  onUnauthorized(fn: () => void) { onUnauthorized = fn; },
};

export function onConnectionChange(fn: (online: boolean) => void) {
  connectionListeners.add(fn);
  return () => { connectionListeners.delete(fn); };
}
function notifyConnection(online: boolean) { connectionListeners.forEach((fn) => fn(online)); }

type Options = { method?: string; body?: unknown; form?: FormData; idempotent?: boolean | string; query?: Record<string, unknown>; raw?: boolean };

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotent) headers["Idempotency-Key"] = typeof opts.idempotent === "string" ? opts.idempotent : uid();
  let url = API_BASE + path;
  if (opts.query) {
    const qs = new URLSearchParams();
    Object.entries(opts.query).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") qs.set(k, String(v)); });
    const s = qs.toString();
    if (s) url += (url.includes("?") ? "&" : "?") + s;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? (opts.body !== undefined || opts.form ? "POST" : "GET"),
      headers,
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    notifyConnection(false);
    throw new ApiError(0, "NETWORK_ERROR", "Can't reach the server. Check your connection; we'll keep retrying.");
  }
  notifyConnection(true);
  if (opts.raw) return res as unknown as T;
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : await res.text();
  if (!res.ok) {
    const e = (data as any)?.error;
    if (res.status === 401 && onUnauthorized && !path.startsWith("/auth/login")) onUnauthorized();
    throw new ApiError(res.status, e?.code ?? "HTTP_ERROR", e?.message ?? `Request failed (${res.status})`, e?.details ?? {}, e?.request_id);
  }
  return data as T;
}

export async function downloadCsv(path: string, query: Record<string, string>, filename: string) {
  const res = await api<Response>(path, { query, raw: true });
  if (!res.ok) throw new ApiError(res.status, "EXPORT_FAILED", "Couldn't export that report.");
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export type Page<T> = { items: T[]; total: number; page: number; page_size: number };
