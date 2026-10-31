import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneFor, STAGE_LABEL, type Tone } from "@/lib/status";
import { humanize } from "@/lib/format";

export function Card({ className, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md bg-surface shadow-card", className)} {...p} />;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-md font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

const toneClass: Record<Tone, string> = {
  neutral: "bg-sunken text-muted ring-line-strong",
  sun: "bg-sun-soft text-[rgb(var(--warn))] ring-sun/40",
  cell: "bg-cell-soft text-cell ring-cell/25",
  ok: "bg-ok-soft text-ok ring-ok/25",
  warn: "bg-warn-soft text-warn ring-warn/25",
  bad: "bg-bad-soft text-bad ring-bad/25",
  info: "bg-info-soft text-info ring-info/25",
};

export function Badge({ tone = "neutral", children, className, dot = true }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded px-2 text-sm font-medium ring-1 ring-inset", toneClass[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" aria-hidden />}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return null;
  return <Badge tone={toneFor(status)} className={className}>{STAGE_LABEL[status] ?? humanize(status)}</Badge>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-sunken", className)} />;
}

export function Spec({ items, className }: { items: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="text-sm text-muted">{k}</dt>
          <dd className="mt-0.5 truncate text-base font-medium">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Callout({ tone = "info", title, children, icon }: { tone?: Tone; title: ReactNode; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className={cn("flex gap-3 rounded-md px-4 py-3 ring-1 ring-inset", toneClass[tone])}>
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <div className="min-w-0 text-ink">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 text-sm text-muted">{children}</div>}
      </div>
    </div>
  );
}
