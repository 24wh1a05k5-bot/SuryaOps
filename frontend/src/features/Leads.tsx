import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CheckCircle2, Plus, Sun, UserCheck, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { date, dateTime, humanize, money, relative, toLocalInput } from "@/lib/format";
import { useAction, useDebounced, useList } from "@/lib/hooks";
import { STAGES, STAGE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, FilterChips, SearchInput } from "@/components/shared/DataTable";
import { StatusStepper } from "@/components/shared/StatusStepper";
import { ActivityTimeline } from "@/components/shared/Activity";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge, Callout, Card, CardHeader, Skeleton, Spec, StatusBadge } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, Toggle, fieldErrors } from "@/components/ui/form";

const SOURCE: Record<string, string> = { web: "Website", call: "Phone call", whatsapp: "WhatsApp", referral: "Referral" };

function NewLeadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate();
  const empty = { name: "", phone: "", city: "Hyderabad", address: "", requested_kw: "3", system_type: "on_grid", wants_subsidy: true, monthly_bill: "", source: "call" };
  const [f, setF] = useState(empty);
  const create = useAction(() => api("/leads", { body: { ...f, requested_kw: Number(f.requested_kw), monthly_bill: f.monthly_bill ? Number(f.monthly_bill) : null, address: f.address || null } }),
    { invalidate: ["leads"], success: (r: any) => (r.returning_customer ? "Lead added to a returning customer" : "Lead created"),
      onSuccess: (r: any) => { onOpenChange(false); setF(empty); nav(`/leads/${r.id}`); }, silentError: false });
  const errs = fieldErrors(create.error);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="New enquiry" description="Phone numbers are unique, so a repeat caller is attached to their existing customer record."
      footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>Create lead</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer name" required error={errs.name}><Input value={f.name} onChange={set("name")} autoFocus /></Field>
        <Field label="Mobile number" required error={errs.phone} hint="10 digits, starting 6 to 9"><Input value={f.phone} onChange={set("phone")} inputMode="numeric" maxLength={10} /></Field>
        <Field label="City"><Select value={f.city} onChange={set("city")}>{["Hyderabad", "Jaipur", "Pune"].map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Came in through"><Select value={f.source} onChange={set("source")}>{Object.entries(SOURCE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
        <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={set("address")} /></Field>
        <Field label="System size (kW)" error={errs.requested_kw}><Input type="number" min={1} max={10} step={0.5} value={f.requested_kw} onChange={set("requested_kw")} /></Field>
        <Field label="System type"><Select value={f.system_type} onChange={set("system_type")}>
          <option value="on_grid">On-grid</option><option value="off_grid">Off-grid with battery</option><option value="panel_set">Panel set only</option></Select></Field>
        <Field label="Monthly electricity bill (₹)" error={errs.monthly_bill}><Input type="number" min={0} value={f.monthly_bill} onChange={set("monthly_bill")} /></Field>
        <div className="flex items-end pb-1"><Toggle checked={f.wants_subsidy} onChange={(v) => setF({ ...f, wants_subsidy: v })} label="Wants PM Surya Ghar subsidy" /></div>
      </div>
    </Dialog>
  );
}

export function LeadsList() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("open");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, status]);
  const statusParam = status === "open" ? "new,contacted,qualified,survey_scheduled,survey_approved,quoted" : status === "all" ? "" : status;
  const list = useList("leads", "/leads", { q: dq, status: statusParam, page, page_size: 20 });
  const { user } = useAuth();
  return (
    <>
      <PageHeader title="Leads" description="Every enquiry from the website, calls and WhatsApp, in one inbox."
        actions={can(user, "sales") && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> New enquiry</Button>} />
      <DataTable rowKey={(r: any) => r.id} rows={list.data?.items} loading={list.isLoading} error={list.error} onRetry={list.refetch}
        page={page} pageSize={20} total={list.data?.total} onPage={setPage} onRowClick={(r: any) => nav(`/leads/${r.id}`)}
        toolbar={<>
          <SearchInput value={q} onChange={setQ} placeholder="Search name, phone or city" />
          <FilterChips value={status} onChange={setStatus} options={[
            { value: "open", label: "Open" }, { value: "new", label: "New" }, { value: "survey_approved", label: "Ready to quote" },
            { value: "won", label: "Won" }, { value: "lost", label: "Lost" }, { value: "all", label: "All" }]} />
        </>}
        empty={<EmptyState title="No leads match" description="Try another search or filter." />}
        columns={[
          { key: "name", header: "Customer", cell: (r: any) => (
            <div><span className="font-medium">{r.customer.name}</span>
              {r.going_cold && <Badge tone="warn" className="ml-2">Going cold</Badge>}
              <span className="block text-sm text-muted">{r.customer.phone}</span></div>) },
          { key: "city", header: "City", hideOnMobile: true, cell: (r: any) => r.customer.city },
          { key: "sys", header: "Requirement", cell: (r: any) => (
            <span>{r.requested_kw} kW {STAGE_LABEL[r.system_type]?.toLowerCase()}{r.wants_subsidy && <span className="block text-sm text-muted">With subsidy</span>}</span>) },
          { key: "src", header: "Source", hideOnMobile: true, cell: (r: any) => SOURCE[r.source] },
          { key: "status", header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
          { key: "created", header: "Received", hideOnMobile: true, align: "right", cell: (r: any) => <span className="text-muted" title={dateTime(r.created_at)}>{relative(r.created_at)}</span> },
        ]} />
      <NewLeadDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function QuoteBuilder({ lead, open, onOpenChange }: { lead: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const nav = useNavigate();
  const kits = useQuery({ queryKey: ["kits"], queryFn: () => api<any[]>("/kits"), enabled: open });
  const [type, setType] = useState(lead.system_type);
  const [kitId, setKitId] = useState<number | null>(null);
  const [subsidy, setSubsidy] = useState(lead.wants_subsidy && lead.system_type !== "panel_set");
  const visible = (kits.data ?? []).filter((k) => k.system_type === type);
  useEffect(() => {
    if (!visible.length) return;
    const best = visible.reduce((a, b) => (Math.abs(b.capacity_kw - lead.requested_kw) < Math.abs(a.capacity_kw - lead.requested_kw) ? b : a));
    setKitId(best.id);
  }, [type, kits.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const kit = visible.find((k) => k.id === kitId);
  const create = useAction(() => api(`/leads/${lead.id}/quote`, { body: { kit_id: kitId, is_subsidy: subsidy } }),
    { success: "Quote created", invalidate: ["leads", "orders"], onSuccess: (o: any) => nav(`/orders/${o.id}`) });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="Build a quote" description={`${lead.customer.name} asked for ${lead.requested_kw} kW. Pick a kit; every part it needs is added automatically.`}
      footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" disabled={!kitId} loading={create.isPending} onClick={() => create.mutate()}>Create quote</Button></>}>
      <FilterChips value={type} onChange={(v) => { setType(v); if (v === "panel_set") setSubsidy(false); }} options={[
        { value: "on_grid", label: "On-grid" }, { value: "off_grid", label: "Off-grid" }, { value: "panel_set", label: "Panel set" }]} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {kits.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        {visible.map((k) => (
          <button key={k.id} onClick={() => setKitId(k.id)}
            className={cn("rounded-md border p-4 text-left transition-colors", kitId === k.id ? "border-sun bg-sun-soft/50 ring-2 ring-sun/30" : "border-line hover:border-line-strong")}>
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{k.capacity_kw} kW</span>
              {Math.abs(k.capacity_kw - lead.requested_kw) < 0.01 && <Badge tone="sun">Requested size</Badge>}
            </div>
            <p className="text-sm text-muted">{k.name}. {k.lines.length} parts{k.includes_installation ? ", installed" : ", no installation"}</p>
            <p className="num mt-2 font-medium">{money(k.price)}</p>
          </button>
        ))}
      </div>
      {kit && (
        <div className="mt-4 rounded-md border border-line">
          <p className="border-b border-line px-4 py-2 text-sm font-medium">Parts that will be added</p>
          <ul className="max-h-48 divide-y divide-line overflow-y-auto text-sm scroll-thin">
            {kit.lines.map((l: any) => (
              <li key={l.product.id} className="flex items-center gap-2 px-4 py-2">
                <span className="num w-8 text-muted">{l.qty}×</span><span className="flex-1">{l.product.name}</span>
                {l.product.category === "panel" && (l.product.is_dcr ? <Badge tone="ok">DCR</Badge> : <Badge tone="warn">Non-DCR</Badge>)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4">
        <Toggle checked={subsidy} onChange={setSubsidy} label="PM Surya Ghar subsidy order"
          description={type === "panel_set" ? "Panel-only sets aren't eligible; the subsidy needs an installed grid-connected system." : "Only DCR panels are allowed, and a subsidy case is opened when the order is confirmed."} />
      </div>
    </Dialog>
  );
}

function QualificationCard({ lead, editable }: { lead: any; editable: boolean }) {
  const c = lead.customer;
  const [f, setF] = useState({
    roof_area_sqft: lead.roof_area_sqft ?? "", shadow_free: lead.shadow_free, grid_suitable: lead.grid_suitable, monthly_bill: c.monthly_bill ?? "",
    consumer_no: c.consumer_no ?? "", aadhaar_name: c.aadhaar_name ?? "", bill_name: c.bill_name ?? "", bank_account_name: c.bank_account_name ?? "",
    bank_aadhaar_seeded: c.bank_aadhaar_seeded,
  });
  const save = useAction(() => api(`/leads/${lead.id}`, { method: "PATCH", body: {
    version: lead.version, roof_area_sqft: f.roof_area_sqft === "" ? null : Number(f.roof_area_sqft), shadow_free: f.shadow_free,
    grid_suitable: f.grid_suitable, monthly_bill: f.monthly_bill === "" ? null : Number(f.monthly_bill), consumer_no: f.consumer_no || null,
    aadhaar_name: f.aadhaar_name || null, bill_name: f.bill_name || null, bank_account_name: f.bank_account_name || null, bank_aadhaar_seeded: f.bank_aadhaar_seeded,
  } }), { success: "Qualification saved", invalidate: ["lead", "leads"] });
  const tri = (v: boolean | null) => (v === true ? "yes" : v === false ? "no" : "");
  const parse = (v: string) => (v === "yes" ? true : v === "no" ? false : null);
  return (
    <Card>
      <CardHeader title="Qualification and subsidy readiness" description="Roof and grid checks from the sales call, plus the names DISCOM matches on the subsidy claim."
        actions={editable && <Button size="sm" variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save</Button>} />
      <fieldset disabled={!editable} className="grid gap-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Usable roof area (sq ft)"><Input type="number" value={f.roof_area_sqft} onChange={(e) => setF({ ...f, roof_area_sqft: e.target.value })} /></Field>
        <Field label="Shadow-free roof"><Select value={tri(f.shadow_free)} onChange={(e) => setF({ ...f, shadow_free: parse(e.target.value) })}><option value="">Not checked</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        <Field label="Grid connection suitable"><Select value={tri(f.grid_suitable)} onChange={(e) => setF({ ...f, grid_suitable: parse(e.target.value) })}><option value="">Not checked</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>
        <Field label="Monthly bill (₹)"><Input type="number" value={f.monthly_bill} onChange={(e) => setF({ ...f, monthly_bill: e.target.value })} /></Field>
        <Field label="Name on Aadhaar"><Input value={f.aadhaar_name} onChange={(e) => setF({ ...f, aadhaar_name: e.target.value })} /></Field>
        <Field label="Name on electricity bill"><Input value={f.bill_name} onChange={(e) => setF({ ...f, bill_name: e.target.value })} /></Field>
        <Field label="Name on bank account"><Input value={f.bank_account_name} onChange={(e) => setF({ ...f, bank_account_name: e.target.value })} /></Field>
        <Field label="DISCOM consumer number"><Input value={f.consumer_no} onChange={(e) => setF({ ...f, consumer_no: e.target.value })} /></Field>
        <div className="sm:col-span-2 lg:col-span-4">
          <Toggle checked={f.bank_aadhaar_seeded} onChange={(v) => setF({ ...f, bank_aadhaar_seeded: v })} label="Bank account is Aadhaar-seeded"
            description="The subsidy is paid by direct benefit transfer, which fails on unseeded accounts." />
        </div>
      </fieldset>
      {lead.wants_subsidy && (
        <div className="border-t border-line px-5 py-4">
          {lead.readiness.ready
            ? <Callout tone="ok" icon={<CheckCircle2 className="h-4 w-4" />} title="Ready for a subsidy claim">Names match on all three documents and the bank account is seeded.</Callout>
            : <Callout tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title="Fix before the subsidy claim">
                <ul className="list-disc pl-4">{lead.readiness.issues.map((i: string) => <li key={i}>{i}</li>)}</ul>
              </Callout>}
        </div>
      )}
    </Card>
  );
}

export function LeadDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["lead", id], queryFn: () => api(`/leads/${id}`) });
  const techs = useQuery({ queryKey: ["users", "technician"], queryFn: () => api<any[]>("/users", { query: { role: "technician" } }) });
  const [dialog, setDialog] = useState<null | "survey" | "lost" | "quote" | "reject">(null);
  const [survey, setSurvey] = useState({ technician_id: "", scheduled_at: toLocalInput(new Date(Date.now() + 86400000)) });
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [rejectId, setRejectId] = useState<number | null>(null);
  const inv = ["lead", "leads", "surveys"];
  const transition = useAction((to: string) => api(`/leads/${id}/transition`, { body: { to, lost_reason: to === "lost" ? reason : undefined } }),
    { success: (r: any) => `Lead marked ${humanize(r.status).toLowerCase()}`, invalidate: inv, onSuccess: () => setDialog(null) });
  const schedule = useAction(() => api(`/leads/${id}/surveys`, { body: { technician_id: Number(survey.technician_id), scheduled_at: new Date(survey.scheduled_at).toISOString() } }),
    { success: "Survey booked", invalidate: inv, onSuccess: () => setDialog(null) });
  const review = useAction(({ sid, approve }: { sid: number; approve: boolean }) => api(`/surveys/${sid}/${approve ? "approve" : "reject"}`, { body: approve ? undefined : { reason } }),
    { success: (r: any) => (r.status === "approved" ? "Survey approved. You can quote now." : "Survey rejected"), invalidate: inv, onSuccess: () => setDialog(null) });
  const addNote = useAction(() => api(`/leads/${id}/notes`, { body: { note } }), { success: "Note added", invalidate: ["lead"], onSuccess: () => setNote("") });

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-16 w-1/2" /><Skeleton className="h-64" /></div>;
  if (q.error) return <EmptyState tone="bad" title="Couldn't open this lead" description={(q.error as Error).message} />;
  const l = q.data;
  const c = l.customer;
  const sales = can(user, "sales");
  const closed = ["won", "lost"].includes(l.status);
  const approvedSurvey = l.surveys.some((s: any) => s.status === "approved");
  return (
    <>
      <PageHeader crumbs={[{ label: "Leads", to: "/leads" }]} title={c.name}
        description={`${c.phone}${c.city ? `, ${c.city}` : ""}. ${l.requested_kw} kW ${STAGE_LABEL[l.system_type]?.toLowerCase()}${l.wants_subsidy ? " with PM Surya Ghar subsidy" : ""}.`}
        meta={<>
          <StatusBadge status={l.status} />
          {l.returning_customer && <Badge tone="info">Returning customer</Badge>}
          {l.going_cold && <Badge tone="warn">Going cold: no activity for 48 hours</Badge>}
          <span className="text-sm text-muted">From {SOURCE[l.source]?.toLowerCase()}, {relative(l.created_at)}</span>
        </>}
        actions={sales && !closed && <>
          {l.status === "new" && <Button loading={transition.isPending} onClick={() => transition.mutate("contacted")}><UserCheck className="h-4 w-4" /> Mark contacted</Button>}
          {["new", "contacted"].includes(l.status) && <Button variant="primary" loading={transition.isPending} onClick={() => transition.mutate("qualified")}>Qualify lead</Button>}
          {["qualified"].includes(l.status) && <Button variant="primary" onClick={() => setDialog("survey")}><CalendarClock className="h-4 w-4" /> Book site survey</Button>}
          <Button variant={approvedSurvey ? "primary" : "secondary"} disabled={!approvedSurvey} title={approvedSurvey ? undefined : "A quote needs an approved site survey"} onClick={() => setDialog("quote")}><Sun className="h-4 w-4" /> Build quote</Button>
          <Button variant="ghost" onClick={() => setDialog("lost")}><XCircle className="h-4 w-4" /> Mark lost</Button>
        </>} />
      <div className="mb-6"><StatusStepper stages={STAGES.lead} current={l.status} terminal={{ status: "lost", label: `Lost: ${l.lost_reason ?? ""}` }} /></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <QualificationCard key={l.version} lead={l} editable={sales && !closed} />
          <Card>
            <CardHeader title="Site surveys" description="A quote can only be built after a survey is approved." />
            {l.surveys.length === 0 ? <EmptyState title="No survey booked" description="Qualify the lead, then book a technician to measure the roof." /> : (
              <ul className="divide-y divide-line">
                {l.surveys.map((s: any) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">Survey on {dateTime(s.scheduled_at)}</p>
                      <p className="text-sm text-muted">{s.status === "scheduled" ? "Waiting for the technician's report" :
                        `${s.roof_direction}-facing, ${s.tilt_deg}° tilt, ${s.cable_distance_m} m cable run, ${s.usable_area_sqft} sq ft usable`}</p>
                      {s.notes && <p className="text-sm text-muted">{s.notes}</p>}
                      {s.rejection_reason && <p className="text-sm text-bad">Rejected: {s.rejection_reason}</p>}
                    </div>
                    <StatusBadge status={s.status} />
                    {sales && s.status === "submitted" && <>
                      <Button size="sm" variant="primary" loading={review.isPending} onClick={() => review.mutate({ sid: s.id, approve: true })}>Approve</Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRejectId(s.id); setDialog("reject"); }}>Reject</Button>
                    </>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {l.orders.length > 0 && (
            <Card>
              <CardHeader title="Quotes and orders" />
              <ul className="divide-y divide-line">
                {l.orders.map((o: any) => (
                  <li key={o.id}><button onClick={() => nav(`/orders/${o.id}`)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-sunken/60">
                    <span className="flex-1 font-medium">{o.number}</span><StatusBadge status={o.status} /><span className="num w-28 text-right">{money(o.total)}</span>
                  </button></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card className="px-5 py-4">
            <Spec className="sm:grid-cols-1" items={[["Address", [c.address, c.city, c.pincode].filter(Boolean).join(", ")], ["Email", c.email], ["Customer since", date(c.created_at)]]} />
          </Card>
          <Card>
            <CardHeader title="Notes" />
            <div className="px-5 py-4">
              {sales && <div className="flex gap-2"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the team" />
                <Button className="self-end" disabled={!note.trim()} loading={addNote.isPending} onClick={() => addNote.mutate()}>Add</Button></div>}
              <ul className="mt-4 space-y-3">
                {l.notes.map((n: any) => <li key={n.id} className="text-base"><p>{n.note}</p><p className="text-sm text-muted">{n.user}, {relative(n.created_at)}</p></li>)}
                {!l.notes.length && <li className="text-sm text-muted">No notes yet.</li>}
              </ul>
            </div>
          </Card>
          <Card><CardHeader title="Activity" /><div className="px-5 py-4"><ActivityTimeline entity="lead" id={l.id} /></div></Card>
        </div>
      </div>

      <Dialog open={dialog === "survey"} onOpenChange={(o) => setDialog(o ? "survey" : null)} title="Book a site survey" description="The technician sees it in their survey list."
        footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" disabled={!survey.technician_id} loading={schedule.isPending} onClick={() => schedule.mutate()}>Book survey</Button></>}>
        <div className="space-y-4">
          <Field label="Technician"><Select value={survey.technician_id} onChange={(e) => setSurvey({ ...survey, technician_id: e.target.value })}>
            <option value="">Choose a technician</option>{techs.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Date and time"><Input type="datetime-local" value={survey.scheduled_at} onChange={(e) => setSurvey({ ...survey, scheduled_at: e.target.value })} /></Field>
        </div>
      </Dialog>
      <Dialog open={dialog === "lost" || dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)}
        title={dialog === "lost" ? "Mark this lead as lost" : "Reject this survey"} description="A reason is required so the team can learn from it."
        footer={<><Button onClick={() => setDialog(null)}>Cancel</Button>
          <Button variant="danger" disabled={reason.trim().length < 3} loading={transition.isPending || review.isPending}
            onClick={() => (dialog === "lost" ? transition.mutate("lost") : review.mutate({ sid: rejectId!, approve: false }))}>{dialog === "lost" ? "Mark lost" : "Reject survey"}</Button></>}>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={dialog === "lost" ? "e.g. chose a cheaper competitor" : "e.g. roof shaded by neighbour's water tank"} /></Field>
      </Dialog>
      {dialog === "quote" && <QuoteBuilder lead={l} open onOpenChange={(o) => !o && setDialog(null)} />}
    </>
  );
}
