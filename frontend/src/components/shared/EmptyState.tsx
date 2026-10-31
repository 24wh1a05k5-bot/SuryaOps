import type { ReactNode } from "react";
import { Inbox, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({ title, description, action, icon, tone = "neutral", className }: {
  title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode; tone?: "neutral" | "bad"; className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <div className={cn("mb-3 grid h-11 w-11 place-items-center rounded-full", tone === "bad" ? "bg-bad-soft text-bad" : "bg-sunken text-faint")}>
        {icon ?? (tone === "bad" ? <TriangleAlert className="h-5 w-5" /> : <Inbox className="h-5 w-5" />)}
      </div>
      <p className="font-medium">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
