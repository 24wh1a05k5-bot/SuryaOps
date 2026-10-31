import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** KPIs sit in one ledger strip divided by hairlines, not as a grid of identical cards. */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 overflow-hidden rounded-md bg-line shadow-card md:grid-cols-4 [&>*]:bg-surface gap-px", className)}>
      {children}
    </div>
  );
}

export function Kpi({ label, value, note, tone, emphasis }: { label: string; value: ReactNode; note?: ReactNode; tone?: "ok" | "bad" | "warn"; emphasis?: boolean }) {
  return (
    <div className={cn("px-5 py-4", emphasis && "bg-sun-soft/40")}>
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("num mt-1 text-2xl font-semibold tracking-tight",
        tone === "bad" && "text-bad", tone === "ok" && "text-ok", tone === "warn" && "text-[rgb(var(--warn))]")}>{value}</p>
      {note && <p className="mt-1 text-sm text-muted">{note}</p>}
    </div>
  );
}
