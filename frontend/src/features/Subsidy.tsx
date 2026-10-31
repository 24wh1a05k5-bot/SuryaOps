import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, ShieldCheck, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { compactMoney, dateTime, humanize, money } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { STAGES, STAGE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge, Callout, Skeleton } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";

const NEXT: Record<string, { to: string; label: string } | undefined> = {
  applied: { to: "feasibility_approved", label: "Feasibility approved" },
  inspection_submitted: { to: "net_meter_installed", label: "Net meter installed" },
  net_meter_installed: { to: "subsidy_credited", label: "Subsidy credited" },
};

function CaseDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["subsidy-case", id], queryFn: () => api(`/subsidy/${id}`) });
  const [appNo, setAppNo] = useState("");
  const inv = ["subsidy", "subsidy-case", "dashboard"];
  const advance = useAction((to: string) => api(`/subsidy/${id}/advance`, { body: { to_stage: to, application_no: appNo || undefined } }),
    { success: (r: any) => `Moved to ${(STAGE_LABEL[r.stage] ?? humanize(r.stage)).toLowerCase()}`, invalidate: inv });
  const submit = useAction(() => api(`/subsidy/${id}/submit-inspection`, { body: {} }), { success: "Submitted for DISCOM inspection", invalidate: inv, silentError: true });
  const c = q.data;
  const next = c ? NEXT[c.stage] : undefined;
  const sales = can(user, "sales");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} wide title={c ? `${c.order.customer.name}, ${c.order.number}` : "Subsidy case"}
      description={c ? `${c.order.capacity_kw} kW. Expected subsidy ${money(c.order.expected_subsidy)} to the customer's bank. Application ${c.application_no ?? "not yet filed"}.` : undefined}>
      {!c ? <Skeleton className="h-64" /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5">
            {STAGES.subsidy.map((s, i) => {
              const idx = STAGES.subsidy.indexOf(c.stage);
              return <span key={s} className={cn("h-6 rounded px-2 text-sm font-medium leading-6", i < idx ? "bg-sun-soft" : i === idx ? "bg-sun text-sun-ink" : "bg-sunken text-faint")}>{STAGE_LABEL[s] ?? humanize(s)}</span>;
            })}
          </div>
          {c.overdue && <Callout tone="bad" icon={<Clock className="h-4 w-4" />} title={`${c.days_in_stage} days at this stage`}>That's past the 30-day target. Follow up with the DISCOM office.</Callout>}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-semibold">Inspection checklist</h3>
              <span className={cn("num text-sm font-medium", c.checklist.ready ? "text-ok" : "text-muted")}>{c.checklist.passed} of {c.checklist.total} passed</span>
            </div>
            <p className="mb-3 text-sm text-muted">The mistakes that most often get claims rejected at inspection, checked before anything is submitted.</p>
            <ul className="divide-y divide-line rounded-md border border-line">
              {c.checklist.checks.map((ck: any) => (
                <li key={ck.key} className="flex items-start gap-3 px-4 py-3">
                  {ck.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-bad" />}
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-base", !ck.ok && "font-medium")}>{ck.label}</p>
                    {!ck.ok && ck.detail && <p className="text-sm text-bad">{ck.detail}</p>}
                  </div>
                  {!ck.ok && ck.fix && <Link to={ck.fix} className="shrink-0 text-sm font-medium text-cell hover:underline" onClick={onClose}>Fix</Link>}
                </li>
              ))}
            </ul>
            {submit.error && <div className="mt-3"><Callout tone="bad" title="Not ready for inspection">{(submit.error as ApiError).message}</Callout></div>}
          </div>
          {sales && (
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
              {c.stage === "applied" && <Field label="Portal application number" className="min-w-[220px] flex-1"><Input value={appNo} onChange={(e) => setAppNo(e.target.value)} placeholder={c.application_no ?? "PMSG-..."} /></Field>}
              {c.stage === "installed" && <Button variant="primary" disabled={!c.checklist.ready} title={c.checklist.ready ? undefined : "Fix every failed check first"} loading={submit.isPending} onClick={() => submit.mutate()}><ShieldCheck className="h-4 w-4" /> Submit for inspection</Button>}
              {next && <Button variant="primary" loading={advance.isPending} onClick={() => advance.mutate(next.to)}>Mark {next.label.toLowerCase()}</Button>}
              {c.stage === "feasibility_approved" && <p className="text-sm text-muted">Moves to Installed automatically when the technician signs off the job.</p>}
            </div>
          )}
          <div>
            <h3 className="mb-2 font-semibold">History</h3>
            <ol className="space-y-2 text-base">
              {c.events.map((e: any, i: number) => (
                <li key={i} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong" />
                  <span><span className="font-medium">{STAGE_LABEL[e.to] ?? humanize(e.to)}</span> <span className="text-muted">by {e.user ?? "System"}, {dateTime(e.at)}</span>
                    {e.note && <span className="block text-sm text-muted">{e.note}</span>}</span></li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export default function Subsidy() {
  const q = useQuery({ queryKey: ["subsidy"], queryFn: () => api("/subsidy") });
  const [open, setOpen] = useState<number | null>(null);
  if (q.isLoading) return <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">{STAGES.subsidy.map((s) => <Skeleton key={s} className="h-80" />)}</div>;
  if (q.error) return <EmptyState tone="bad" title="Couldn't load the tracker" description={(q.error as Error).message} />;
  const cases = q.data.cases as any[];
  const overdue = cases.filter((c) => c.overdue).length;
  const pending = cases.filter((c) => c.stage !== "subsidy_credited").reduce((s, c) => s + c.order.expected_subsidy, 0);
  return (
    <>
      <PageHeader title="Subsidy tracker" description="Every PM Surya Ghar case from application to money in the customer's account. Cards turn red after 30 days in one stage."
        meta={<><Badge tone={overdue ? "bad" : "ok"}>{overdue} overdue</Badge><Badge tone="cell" dot={false}>{compactMoney(pending)} still to be credited to customers</Badge></>} />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 scroll-thin md:-mx-8 md:px-8">
        <div className="grid min-w-[1100px] grid-cols-6 gap-3">
          {STAGES.subsidy.map((stage) => {
            const col = cases.filter((c) => c.stage === stage);
            return (
              <section key={stage} className="flex flex-col rounded-md bg-sunken/70 p-2" aria-label={STAGE_LABEL[stage] ?? stage}>
                <header className="flex items-center justify-between px-2 pb-2 pt-1">
                  <h2 className="text-sm font-semibold">{STAGE_LABEL[stage] ?? humanize(stage)}</h2>
                  <span className="num text-sm text-muted">{col.length}</span>
                </header>
                <div className="space-y-2">
                  {col.map((c) => (
                    <button key={c.id} onClick={() => setOpen(c.id)}
                      className={cn("w-full rounded-md bg-surface p-3 text-left shadow-card transition-shadow hover:shadow-pop", c.overdue && "ring-1 ring-inset ring-bad/50")}>
                      <p className="truncate font-medium">{c.order.customer.name}</p>
                      <p className="text-sm text-muted">{c.order.number}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <Badge tone={c.overdue ? "bad" : c.stage === "subsidy_credited" ? "ok" : "neutral"} dot={false}><Clock className="h-3 w-3" />{c.days_in_stage}d</Badge>
                        <span className="num text-sm text-muted">{c.order.capacity_kw} kW, {compactMoney(c.order.expected_subsidy)}</span>
                      </div>
                    </button>
                  ))}
                  {!col.length && <p className="px-2 py-4 text-center text-sm text-faint">None</p>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
      {open && <CaseDrawer id={open} onClose={() => setOpen(null)} />}
    </>
  );
}
