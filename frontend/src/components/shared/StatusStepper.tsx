import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_LABEL } from "@/lib/status";
import { humanize } from "@/lib/format";

/** Odoo-style status bar: chevron segments that fill with sunlight as work moves forward. */
export function StatusStepper({ stages, current, terminal }: { stages: string[]; current: string; terminal?: { status: string; label: string } }) {
  const idx = stages.indexOf(current);
  if (terminal && current === terminal.status) {
    return <div className="inline-flex h-8 items-center rounded bg-sunken px-3 text-sm font-medium text-muted">{terminal.label}</div>;
  }
  return (
    <ol className="flex overflow-x-auto scroll-thin" aria-label="Progress">
      {stages.map((s, i) => {
        const done = i < idx, active = i === idx;
        return (
          <li key={s} aria-current={active ? "step" : undefined}
            className={cn(
              "relative flex h-8 shrink-0 items-center gap-1.5 pl-5 pr-3 text-sm font-medium first:rounded-l first:pl-3 last:rounded-r",
              "[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)] first:[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%)]",
              "-ml-1.5 first:ml-0",
              active ? "bg-sun text-sun-ink" : done ? "bg-sun-soft text-ink" : "bg-sunken text-faint",
            )}>
            {done && <Check className="h-3.5 w-3.5 text-[rgb(var(--warn))]" aria-hidden />}
            <span className="pr-1">{STAGE_LABEL[s] ?? humanize(s)}</span>
          </li>
        );
      })}
    </ol>
  );
}
