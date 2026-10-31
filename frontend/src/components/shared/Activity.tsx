import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { humanize, relative, dateTime } from "@/lib/format";
import { Skeleton } from "../ui/surface";

const HIDE = new Set(["lead_id", "survey_id", "returning_customer"]);
/** Turn raw audit details into a short readable line. */
function describe(details: Record<string, unknown>) {
  const parts: string[] = [];
  if (details.from !== undefined && details.to !== undefined) parts.push(`from ${humanize(String(details.from)).toLowerCase()} to ${humanize(String(details.to)).toLowerCase()}`);
  for (const [k, v] of Object.entries(details)) {
    if (HIDE.has(k) || k === "from" || k === "to" || v === null || v === "" || v === false) continue;
    if (k === "fields" && Array.isArray(v)) { parts.push(`changed ${v.map((f) => humanize(String(f)).toLowerCase()).join(", ")}`); continue; }
    if (v === true) { parts.push(humanize(k).toLowerCase()); continue; }
    parts.push(`${humanize(k).toLowerCase()} ${Array.isArray(v) ? v.join(", ") : String(v)}`);
  }
  const text = parts.join(", ");
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export function ActivityTimeline({ entity, id }: { entity: string; id: number }) {
  const q = useQuery({ queryKey: ["activity", entity, id], queryFn: () => api<any[]>("/activity", { query: { entity, entity_id: id } }) });
  const [all, setAll] = useState(false);
  if (q.isLoading) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (!q.data?.length) return <p className="text-sm text-muted">No activity recorded yet.</p>;
  return (
    <>
    <ol className="relative space-y-4 border-l border-line pl-5">
      {(all ? q.data : q.data.slice(0, 8)).map((a) => (
        <li key={a.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-line-strong" />
          <p className="text-base"><span className="font-medium">{a.user}</span> <span className="text-muted">{humanize(a.action).toLowerCase()}</span></p>
          {a.details && describe(a.details) && <p className="text-sm text-muted">{describe(a.details)}</p>}
          <time className="text-sm text-faint" title={dateTime(a.created_at)}>{relative(a.created_at)}</time>
        </li>
      ))}
    </ol>
    {q.data.length > 8 && <button className="mt-3 text-sm font-medium text-cell hover:underline" onClick={() => setAll(!all)}>{all ? "Show less" : `Show all ${q.data.length} events`}</button>}
    </>
  );
}
