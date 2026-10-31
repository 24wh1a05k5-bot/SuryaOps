import { useState, type ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck, ShieldX, Sun } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { date, dateTime } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { BrandMark } from "@/components/shared/Brand";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Callout, Card, Skeleton } from "@/components/ui/surface";
import { Field, Input, Select, Textarea, Toggle, fieldErrors } from "@/components/ui/form";
import { DashboardBody } from "./Dashboard";

function PublicFrame({ children, company, wide }: { children: ReactNode; company?: string; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line bg-surface">
        <div className={`mx-auto flex h-14 items-center gap-3 px-4 ${wide ? "max-w-6xl" : "max-w-xl"}`}>
          <BrandMark className="h-7 w-7" /><span className="font-semibold">{company ?? "SunPower Solutions"}</span>
          <div className="no-print ml-auto"><ThemeToggle /></div>
        </div>
      </header>
      <main className={`mx-auto px-4 py-8 ${wide ? "max-w-6xl" : "max-w-xl"}`}>{children}</main>
    </div>
  );
}

/** Website enquiry form: lands in the sales inbox instantly. */
export function EnquiryForm() {
  const [f, setF] = useState({ name: "", phone: "", city: "Hyderabad", address: "", requested_kw: "3", system_type: "on_grid", wants_subsidy: true, monthly_bill: "" });
  const send = useAction(() => api("/public/leads", { body: { ...f, requested_kw: Number(f.requested_kw), monthly_bill: f.monthly_bill ? Number(f.monthly_bill) : null, address: f.address || null } }), { silentError: true });
  const errs = fieldErrors(send.error);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  if (send.data) {
    return (
      <PublicFrame>
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-ok" />
          <h1 className="mt-3 text-xl font-semibold">Thanks, we've got your enquiry</h1>
          <p className="mt-1 text-muted">{(send.data as any).message}</p>
          <p className="mt-4 text-sm text-muted">Your reference is <span className="font-semibold text-ink">{(send.data as any).reference}</span></p>
        </Card>
      </PublicFrame>
    );
  }
  return (
    <PublicFrame>
      <h1 className="text-2xl font-semibold tracking-tight">Get a rooftop solar quote</h1>
      <p className="mt-1 text-muted">Tell us about your home. A solar advisor will call to check your roof and electricity bill, then send a site engineer.</p>
      <Card className="mt-6 p-6">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
          {send.error && !Object.keys(errs).length && <div className="sm:col-span-2"><Callout tone="bad" title="That didn't go through">{(send.error as ApiError).message}</Callout></div>}
          <Field label="Your name" required error={errs.name} className="sm:col-span-2"><Input value={f.name} onChange={set("name")} required /></Field>
          <Field label="Mobile number" required error={errs.phone}><Input value={f.phone} onChange={set("phone")} inputMode="numeric" maxLength={10} required /></Field>
          <Field label="City"><Select value={f.city} onChange={set("city")}>{["Hyderabad", "Jaipur", "Pune"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={set("address")} /></Field>
          <Field label="Average monthly bill (₹)" error={errs.monthly_bill}><Input type="number" min={0} value={f.monthly_bill} onChange={set("monthly_bill")} /></Field>
          <Field label="System size" hint="About 1 kW for every ₹1,000 of monthly bill"><Select value={f.requested_kw} onChange={set("requested_kw")}>{["1", "2", "3", "5"].map((k) => <option key={k} value={k}>{k} kW</option>)}</Select></Field>
          <Field label="Type" className="sm:col-span-2"><Select value={f.system_type} onChange={set("system_type")}>
            <option value="on_grid">Grid-connected (lowest bills)</option><option value="off_grid">With battery backup</option><option value="panel_set">Panels only, I'll install</option></Select></Field>
          <div className="sm:col-span-2"><Toggle checked={f.wants_subsidy} onChange={(v) => setF({ ...f, wants_subsidy: v })} label="I'd like the PM Surya Ghar subsidy" description="Up to ₹78,000, paid by the government to your bank account." /></div>
          <Button type="submit" variant="primary" size="lg" className="justify-center sm:col-span-2" loading={send.isPending}><Sun className="h-5 w-5" /> Request a call back</Button>
        </form>
      </Card>
    </PublicFrame>
  );
}

/** What a customer sees after scanning the QR sticker on their inverter or battery. */
export function UnitPage() {
  const { token } = useParams();
  const q = useQuery({ queryKey: ["public-unit", token], queryFn: () => api(`/public/units/${token}`) });
  const [issue, setIssue] = useState("");
  const report = useAction(() => api(`/public/units/${token}/tickets`, { body: { issue } }), { silentError: true });
  if (q.isLoading) return <PublicFrame><Skeleton className="h-80" /></PublicFrame>;
  if (q.error) return <PublicFrame><EmptyState tone="bad" title="We couldn't find this device" description={(q.error as Error).message} /></PublicFrame>;
  const u = q.data;
  const done = report.data as any;
  return (
    <PublicFrame company={u.company}>
      <p className="text-sm text-muted">Registered to {u.owner}{u.city ? `, ${u.city}` : ""}</p>
      <h1 className="mt-1 text-xl font-semibold">{u.product}</h1>
      <p className="text-muted">Serial {u.serial_no}. Installed {date(u.installed_on)}.</p>
      <div className={`mt-5 flex items-center gap-4 rounded-lg p-5 ring-1 ring-inset ${u.in_warranty ? "bg-ok-soft ring-ok/25" : "bg-bad-soft ring-bad/25"}`}>
        {u.in_warranty ? <ShieldCheck className="h-10 w-10 text-ok" /> : <ShieldX className="h-10 w-10 text-bad" />}
        <div>
          <p className="text-lg font-semibold">{u.in_warranty ? "Under warranty" : "Warranty has ended"}</p>
          <p className="text-muted">{u.in_warranty ? `Repairs are free until ${date(u.warranty_end)}.` : `Ended ${date(u.warranty_end)}. Repairs are charged for parts and labour.`}</p>
        </div>
      </div>
      <Card className="mt-6 p-5">
        {done ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-ok" />
            <p className="mt-2 text-lg font-semibold">Complaint {done.number} registered</p>
            <p className="text-muted">{done.message} We aim to fix it by {date(done.due_by)}.</p>
          </div>
        ) : u.open_ticket ? (
          <p>Complaint <span className="font-semibold">{u.open_ticket.number}</span> is already being handled. We aim to fix it by {date(u.open_ticket.due_by)}.</p>
        ) : (
          <>
            <h2 className="font-semibold">Report a problem</h2>
            <p className="mb-3 text-sm text-muted">We already know which device and address this is. Just tell us what's wrong.</p>
            {report.error && <div className="mb-3"><Callout tone="bad" title="Couldn't send that">{(report.error as ApiError).message}</Callout></div>}
            <Textarea value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="e.g. No power since last night, red light blinking" />
            <Button variant="primary" size="lg" className="mt-3 w-full justify-center" disabled={issue.trim().length < 5} loading={report.isPending} onClick={() => report.mutate()}>Send complaint</Button>
          </>
        )}
      </Card>
    </PublicFrame>
  );
}

/** Read-only report for a share link. No login, no personal data. */
export function SharedReport() {
  const { token } = useParams();
  const q = useQuery({ queryKey: ["shared", token], queryFn: () => api(`/public/shared/${token}`), retry: false });
  if (q.isLoading) return <PublicFrame wide><Skeleton className="h-96" /></PublicFrame>;
  if (q.error) return <PublicFrame><EmptyState tone="bad" title="This link can't be opened" description={(q.error as Error).message} /></PublicFrame>;
  const r = q.data;
  return (
    <PublicFrame wide company={r.company}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{r.title}</h1>
          <p className="text-muted">{date(r.dashboard.period.from)} to {date(r.dashboard.period.to)}. Read-only, generated {dateTime(r.dashboard.generated_at)}.</p>
        </div>
        <p className="text-sm text-muted">Link expires {date(r.expires_at)}</p>
      </div>
      <DashboardBody d={r.dashboard} publicView />
    </PublicFrame>
  );
}

/** Print-optimised director's report: open, then Save as PDF. */
export function PrintReport() {
  const [params] = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const q = useQuery({ queryKey: ["dashboard", { from, to }], queryFn: () => api("/dashboard", { query: { d_from: from, d_to: to } }) });
  const s = useQuery({ queryKey: ["settings"], queryFn: () => api("/settings") });
  if (q.isLoading) return <PublicFrame wide><Skeleton className="h-96" /></PublicFrame>;
  if (q.error) return <PublicFrame><EmptyState tone="bad" title="Report didn't load" description={(q.error as Error).message} /></PublicFrame>;
  return (
    <PublicFrame wide company={s.data?.company_name}>
      <div className="mb-6 flex items-end justify-between gap-3">
        <div><h1 className="text-xl font-semibold">Director's report</h1><p className="text-muted">{date(from)} to {date(to)}</p></div>
        <Button className="no-print" variant="primary" onClick={() => window.print()}>Print or save PDF</Button>
      </div>
      <DashboardBody d={q.data} publicView />
    </PublicFrame>
  );
}
