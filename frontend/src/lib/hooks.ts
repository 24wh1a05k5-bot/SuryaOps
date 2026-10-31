import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, type Page } from "./api";

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** Server-side paginated, filtered list. */
export function useList<T = any>(key: string, path: string, params: Record<string, unknown>) {
  return useQuery({
    queryKey: [key, params],
    queryFn: () => api<Page<T>>(path, { query: params }),
    placeholderData: keepPreviousData,
  });
}

export function showError(e: unknown) {
  const err = e as ApiError;
  if (err?.code === "STALE_VERSION") {
    toast.error("Someone else just updated this record", { description: "Refresh the page to see the latest version." });
    return;
  }
  toast.error(err?.message ?? "Something went wrong", { description: err?.requestId ? `Request ID ${err.requestId}` : undefined });
}

/** A mutation that toasts success with the action's own name and invalidates related lists. */
export function useAction<TArgs = void, TRes = any>(fn: (args: TArgs) => Promise<TRes>, opts: {
  success?: string | ((r: TRes) => string); invalidate?: string[]; onSuccess?: (r: TRes) => void; silentError?: boolean;
} = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
      (opts.invalidate ?? []).forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      opts.onSuccess?.(r);
    },
    onError: (e) => { if (!opts.silentError) showError(e); },
  });
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const r = await fetch("/api/v1/health", { cache: "no-store" });
        if (alive) setOnline(r.ok);
      } catch { if (alive) setOnline(false); }
      if (alive) timer = setTimeout(check, online ? 30000 : 4000);
    };
    import("./api").then(({ onConnectionChange }) => onConnectionChange((o) => { if (alive) setOnline(o); }));
    check();
    return () => { alive = false; clearTimeout(timer); };
  }, [online]);
  return online;
}
