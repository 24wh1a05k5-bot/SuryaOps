import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, CheckCircle2, CircleDot, Play, Save, ShieldAlert, Truck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { date, dateTime, time, toLocalInput } from "@/lib/format";
import { useAction, useList } from "@/lib/hooks";
import { STAGES } from "@/lib/status";
import { cn, safeStorage } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, FilterChips } from "@/components/shared/DataTable";
import { StatusStepper } from "@/components/shared/StatusStepper";
import { EmptyState } from "@/components/shared/EmptyState";
import { PhotoCapture, SignaturePad } from "@/components/shared/Capture";
import { Badge, Callout, Card, CardHeader, Skeleton, Spec, StatusBadge } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

export function JobsList() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState("unscheduled,scheduled,in_progress");
  const [page, setPage] = useState(1);
  const list = useList("jobs", "/jobs", { status, page, page_size: 20 });
  const tech = user?.role === "technician";
  return (
    <>
      <PageHeader title={tech ? "My installations" : "Installations"} description="Crew jobs are created automatically when an order is confirmed. Technicians complete them on their phone." />
      <DataTable rowKey={(r: any) => r.id} rows={list.data?.items} loading={list.isLoading} error={list.error} onRetry={list.refetch}
        page={page} pageSize={20} total={list.data?.total} onPage={setPage} onRowClick={(r: any) => nav(`/jobs/${r.id}`)}
        toolbar={<FilterChips value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
          { value: "unscheduled,scheduled,in_progress", label: "Open" }, { value: "unscheduled", label: "Needs scheduling" },
          { value: "scheduled", label: "Scheduled" }, { value: "customer_accepted", label: "Signed off" }, { value: "", label: "All" }]} />}
        empty={<EmptyState title={tech ? "No jobs assigned to you" : "No installation jobs here"} />}
        columns={[
          { key: "c", header: "Customer", cell: (r: any) => <div><span className="font-medium">{r.order.customer.name}</span><span className="block text-sm text-muted">{r.order.customer.address}, {r.order.customer.city}</span></div> },
          { key: "k", header: "System", hideOnMobile: true, cell: (r: any) => <span>{r.order.kit.name}{r.order.is_subsidy && <Badge tone="cell" dot={false} className="ml-2">Subsidy</Badge>}</span> },
          { key: "t", header: "Technician", hideOnMobile: true, cell: (r: any) => r.technician?.name ?? <span className="text-faint">Not assigned</span> },
          { key: "w", header: "When", cell: (r: any) => r.scheduled_start ? <span>{date(r.scheduled_start)}<span className="block text-sm text-muted">{time(r.scheduled_start)} to {time(r.scheduled_end)}</span></span> : <span className="text-faint">Not scheduled</span> },
          { key: "s", header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
        ]} />
    </>
  );
}

function ScheduleDialog({ job, onClose }: { job: any; onClose: () => void }) {
  const techs = useQuery({ queryKey: ["users", "technician"], queryFn: () => api<any[]>("/users", { query: { role: "technician" } }) });
  const start0 = job.scheduled_start ? new Date(job.scheduled_start) : (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; })();
  const [f, setF] = useState({ technician_id: String(job.technician_id ?? ""), start: toLocalInput(start0), hours: "6" });
  const save = useAction(() => {
    const s = new Date(f.start);
    return api(`/jobs/${job.id}/schedule`, { body: { technician_id: Number(f.technician_id), scheduled_start: s.toISOString(), scheduled_end: new Date(s.getTime() + Number(f.hours) * 3600000).toISOString() } });
  }, { success: "Job scheduled", invalidate: ["job", "jobs"], onSuccess: onClose, silentError: true });
  const err = save.error as ApiError | null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Schedule installation" description="A technician can't be booked on two jobs at the same time."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!f.technician_id} loading={save.isPending} onClick={() => save.mutate()}>Schedule</Button></>}>
      {err && <div className="mb-4"><Callout tone="bad" title={err.code === "TECHNICIAN_DOUBLE_BOOKED" ? "Technician already booked" : "Couldn't schedule"}>{err.message}</Callout></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Technician" className="sm:col-span-2"><Select value={f.technician_id} onChange={(e) => setF({ ...f, technician_id: e.target.value })}>
          <option value="">Choose a technician</option>{techs.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Start"><Input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Duration"><Select value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })}>{["3", "4", "6", "8"].map((h) => <option key={h} value={h}>{h} hours</option>)}</Select></Field>
      </div>
    </Dialog>
  );
}

const STEPS = [
  { key: "serials", label: "Serials" }, { key: "photos", label: "Photos" }, { key: "signoff", label: "Sign-off" },
] as const;

function InstallFlow({ job }: { job: any }) {
  const qc = useQueryClient();
  const draftKey = `suryaops-install-draft-${job.id}`;
  const saved = useMemo(() => { try { return JSON.parse(safeStorage.get(draftKey) ?? "{}"); } catch { return {}; } }, [draftKey]);
  const [step, setStep] = useState<(typeof STEPS)[number]["key"]>(saved.step ?? "serials");
  const [serialText, setSerialText] = useState<string>(saved.serialText ?? "");
  const [kw, setKw] = useState<string>(saved.kw ?? String(job.order.capacity_kw));
  const [notes, setNotes] = useState<string>(saved.notes ?? "");
  const [signer, setSigner] = useState<string>(saved.signer ?? job.order.customer.name);
  const [sig, setSig] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  useEffect(() => {
    safeStorage.set(draftKey, JSON.stringify({ step, serialText, kw, notes, signer }));
    setSavedAt(new Date());
  }, [step, serialText, kw, notes, signer, draftKey]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["job", String(job.id)] });

  const linked = job.serials.filter((s: any) => s.linked).length;
  const allLinked = linked === job.serials.length;
  const kinds = new Set(job.photos.map((p: any) => p.kind));
  const photosOk = kinds.has("roof") && kinds.has("inverter_serial");

  const link = useAction((serials: string[]) => api(`/jobs/${job.id}/serials`, { body: { serials } }), { success: "Serials recorded", onSuccess: () => { setSerialText(""); refresh(); } });
  const complete = useAction(() => api(`/jobs/${job.id}/complete`, { body: { installed_kw: Number(kw), signed_by_name: signer, signature_data_url: sig, notes: notes || null } }),
    { success: "Installation signed off. Warranty, subsidy case and profit updated.", invalidate: ["jobs", "orders"], onSuccess: () => { safeStorage.remove(draftKey); refresh(); }, silentError: true });
  const err = complete.error as ApiError | null;
  const done = { serials: allLinked, photos: photosOk, signoff: false };

  return (
    <Card className="overflow-hidden">
      <div className="flex border-b border-line">
        {STEPS.map((s, i) => (
          <button key={s.key} onClick={() => setStep(s.key)} aria-current={step === s.key ? "step" : undefined}
            className={cn("flex flex-1 items-center justify-center gap-2 px-2 py-3.5 text-base font-medium transition-colors",
              step === s.key ? "border-b-2 border-sun bg-sun-soft/30 text-ink" : "text-muted hover:text-ink")}>
            <span className={cn("grid h-6 w-6 place-items-center rounded-full text-sm", done[s.key] ? "bg-ok text-white" : step === s.key ? "bg-sun text-sun-ink" : "bg-sunken")}>
              {done[s.key] ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>{s.label}
          </button>
        ))}
      </div>
      <div className="p-5">
        {step === "serials" && (
          <div>
            <p className="text-base">Scan the serial on every panel and on the inverter as it goes up. DISCOM checks each one against the approved list.</p>
            <div className="mt-4 flex gap-2">
              <Input className="h-12 text-md uppercase" value={serialText} onChange={(e) => setSerialText(e.target.value)} placeholder="Scan or type serials"
                onKeyDown={(e) => { if (e.key === "Enter" && serialText.trim()) link.mutate(serialText.split(/[\s,]+/).filter(Boolean)); }} />
              <Button size="lg" variant="primary" disabled={!serialText.trim()} loading={link.isPending} onClick={() => link.mutate(serialText.split(/[\s,]+/).filter(Boolean))}>Record</Button>
            </div>
            <Button className="mt-2" size="sm" variant="ghost" disabled={allLinked} onClick={() => link.mutate(job.serials.filter((s: any) => !s.linked).map((s: any) => s.serial_no))}>Record all delivered units</Button>
            <p className="num mt-4 text-sm font-medium">{linked} of {job.serials.length} recorded</p>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {job.serials.map((s: any) => (
                <li key={s.serial_no} className={cn("flex items-center gap-2 rounded px-3 py-2 text-base", s.linked ? "bg-ok-soft" : "bg-sunken")}>
                  {s.linked ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <CircleDot className="h-4 w-4 text-faint" />}
                  <span className="font-medium">{s.serial_no}</span><span className="ml-auto truncate text-sm text-muted">{s.product}</span>
                </li>
              ))}
            </ul>
            <Button className="mt-5 w-full justify-center sm:w-auto" size="lg" disabled={!allLinked} onClick={() => setStep("photos")}>Next: photos</Button>
          </div>
        )}
        {step === "photos" && (
          <div>
            <PhotoCapture endpoint={`/jobs/${job.id}/photos`} existing={job.photos} onUploaded={refresh}
              kinds={[{ value: "roof", label: "Panels on roof" }, { value: "inverter_serial", label: "Inverter with serial visible" }, { value: "wiring", label: "Wiring and earthing" }, { value: "meter", label: "Meter location" }]} />
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <Badge tone={kinds.has("roof") ? "ok" : "warn"}>Roof photo {kinds.has("roof") ? "added" : "needed"}</Badge>
              <Badge tone={kinds.has("inverter_serial") ? "ok" : "warn"}>Inverter serial photo {kinds.has("inverter_serial") ? "added" : "needed"}</Badge>
            </div>
            <Button className="mt-5 w-full justify-center sm:w-auto" size="lg" disabled={!photosOk} onClick={() => setStep("signoff")}>Next: sign-off</Button>
          </div>
        )}
        {step === "signoff" && (
          <div className="space-y-4">
            {err && <Callout tone="bad" title="Can't sign off yet">{err.message}</Callout>}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Installed capacity (kW)" hint={job.order.is_subsidy ? `Sanctioned: ${job.order.sanctioned_kw} kW. Going over makes the subsidy invalid.` : undefined}>
                <Input type="number" step={0.1} className="h-12 text-md" value={kw} onChange={(e) => setKw(e.target.value)} />
              </Field>
              <Field label="Signed by"><Input className="h-12 text-md" value={signer} onChange={(e) => setSigner(e.target.value)} /></Field>
            </div>
            <Field label="Notes for the office"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Generation reading, anything the customer asked" /></Field>
            <div><p className="mb-1.5 text-sm font-medium">Customer signature</p><SignaturePad onChange={setSig} /></div>
            <Button size="lg" variant="primary" className="w-full justify-center" disabled={!sig || !allLinked || !photosOk} loading={complete.isPending} onClick={() => complete.mutate()}>
              <CheckCircle2 className="h-5 w-5" /> Complete and sign off
            </Button>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 border-t border-line bg-sunken/40 px-5 py-2 text-sm text-muted">
        <Save className="h-3.5 w-3.5" /> Draft saved on this device{savedAt ? ` at ${savedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : ""}. Nothing is lost if the signal drops.
      </div>
    </Card>
  );
}

export function JobDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["job", id], queryFn: () => api(`/jobs/${id}`) });
  const [scheduling, setScheduling] = useState(false);
  const start = useAction(() => api(`/jobs/${id}/start`, { body: {} }), { success: "Job started", invalidate: ["job", "jobs"], silentError: true });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error) return <EmptyState tone="bad" title="Couldn't open this job" description={(q.error as Error).message} />;
  const j = q.data;
  const o = j.order;
  const c = o.customer;
  const tech = can(user, "technician") && (user?.role !== "technician" || j.technician_id === user.id);
  const startErr = start.error as ApiError | null;
  const feasibilityPending = o.is_subsidy && j.subsidy_stage === "applied";
  return (
    <>
      <PageHeader crumbs={[{ label: "Installations", to: "/jobs" }]} title={c.name}
        description={`${c.address}, ${c.city}. ${o.kit.name}, order ${o.number}.`}
        meta={<>{o.is_subsidy && <Badge tone="cell">PM Surya Ghar, sanctioned {o.sanctioned_kw} kW</Badge>}{j.technician && <Badge dot={false}>{j.technician.name}</Badge>}</>}
        actions={<>
          {can(user, "sales") && ["unscheduled", "scheduled"].includes(j.status) && <Button onClick={() => setScheduling(true)}><CalendarClock className="h-4 w-4" /> {j.status === "unscheduled" ? "Schedule" : "Reschedule"}</Button>}
          {tech && j.status === "scheduled" && <Button variant="primary" size="lg" loading={start.isPending} onClick={() => start.mutate()}><Play className="h-4 w-4" /> Start job</Button>}
          <Button variant="ghost" onClick={() => nav(`/orders/${o.id}`)}>View order</Button>
        </>} />
      <div className="mb-6"><StatusStepper stages={STAGES.job} current={j.status} terminal={{ status: "cancelled", label: "Cancelled" }} /></div>
      {startErr && <div className="mb-4"><Callout tone="bad" icon={<ShieldAlert className="h-4 w-4" />} title={startErr.code === "FEASIBILITY_NOT_APPROVED" ? "Hold on: DISCOM feasibility isn't approved" : "Can't start this job"}>{startErr.message}</Callout></div>}
      {!startErr && feasibilityPending && j.status === "scheduled" && <div className="mb-4"><Callout tone="warn" icon={<ShieldAlert className="h-4 w-4" />} title="Waiting for DISCOM feasibility approval">Installing before approval is one of the most common reasons subsidy claims are rejected, so this job can't start yet.</Callout></div>}
      {o.status !== "delivered" && j.status === "scheduled" && <div className="mb-4"><Callout tone="info" icon={<Truck className="h-4 w-4" />} title="Materials not delivered yet">The job can start once the warehouse marks the order delivered.</Callout></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div>
          {j.status === "in_progress" && tech ? <InstallFlow job={j} /> : j.status === "customer_accepted" ? (
            <Card>
              <CardHeader title="Signed off" description={`By ${j.signed_by_name} on ${dateTime(j.accepted_at)}`} />
              <div className="grid gap-5 p-5 sm:grid-cols-[1fr_220px]">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {j.photos.map((p: any) => <img key={p.id} src={p.url} alt={p.kind} className="aspect-[4/3] w-full rounded object-cover" loading="lazy" />)}
                </div>
                {j.signature_url && <div className="rounded border border-line bg-white p-2"><img src={j.signature_url} alt="Customer signature" className="w-full" /></div>}
              </div>
            </Card>
          ) : (
            <Card className="p-5">
              <p className="font-medium">{j.status === "unscheduled" ? "This job needs a date and a technician." : `Scheduled for ${dateTime(j.scheduled_start)}.`}</p>
              <p className="mt-1 text-sm text-muted">{tech ? "Tap Start job when you reach the site. You'll record serials, take photos and get the customer's signature." : "The technician completes the job from their phone."}</p>
            </Card>
          )}
        </div>
        <Card className="h-fit px-5 py-4">
          <Spec className="sm:grid-cols-1" items={[
            ["Customer phone", <a key="p" href={`tel:${c.phone}`} className="text-cell hover:underline">{c.phone}</a>],
            ["Scheduled", j.scheduled_start ? `${dateTime(j.scheduled_start)} to ${time(j.scheduled_end)}` : "Not scheduled"],
            ["Started", dateTime(j.actual_start)], ["Finished", dateTime(j.actual_end)],
            ["Installed capacity", j.installed_kw ? `${j.installed_kw} kW` : "—"], ["Subsidy stage", j.subsidy_stage ? <StatusBadge key="s" status={j.subsidy_stage} /> : "Not a subsidy job"],
          ]} />
        </Card>
      </div>
      {scheduling && <ScheduleDialog job={j} onClose={() => setScheduling(false)} />}
    </>
  );
}
