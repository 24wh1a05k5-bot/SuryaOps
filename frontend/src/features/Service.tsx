import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock, Plus, QrCode, Search, ShieldCheck, ShieldX, Wrench } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { date, dateTime, money, relative } from "@/lib/format";
import { useAction, useDebounced, useList } from "@/lib/hooks";
import { STAGES } from "@/lib/status";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, FilterChips, SearchInput } from "@/components/shared/DataTable";
import { StatusStepper } from "@/components/shared/StatusStepper";
import { EmptyState } from "@/components/shared/EmptyState";
import { ActivityTimeline } from "@/components/shared/Activity";
import { PhotoCapture } from "@/components/shared/Capture";
import { Badge, Callout, Card, CardHeader, Skeleton, Spec, StatusBadge } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/form";

const CHANNEL: Record<string, string> = { phone: "Phone", qr: "QR sticker", walk_in: "Walk-in" };

function Deadline({ t }: { t: any }) {
  if (["resolved", "closed"].includes(t.status)) return <span className="text-sm text-muted">Done {relative(t.resolved_at)}</span>;
  const d = Math.round(t.days_left);
  return <Badge tone={t.overdue ? "bad" : d <= 3 ? "warn" : "neutral"}><Clock className="h-3 w-3" />{t.overdue ? `${Math.abs(d)}d overdue` : `${d}d left`}</Badge>;
}

function NewTicket({ onClose }: { onClose: () => void }) {
  const nav = useNavigate();
  const [serial, setSerial] = useState("");
  const [issue, setIssue] = useState("");
  const [channel, setChannel] = useState("phone");
  const dSerial = useDebounced(serial.trim(), 350);
  const lookup = useQuery({ queryKey: ["unit-lookup", dSerial], queryFn: () => api("/stock/units", { query: { serial: dSerial, page_size: 5 } }), enabled: dSerial.length >= 4 });
  const match = lookup.data?.items?.find((u: any) => u.serial_no.toUpperCase() === dSerial.toUpperCase()) ?? (lookup.data?.items?.length === 1 ? lookup.data.items[0] : null);
  const create = useAction(() => api("/tickets", { body: { serial: match?.serial_no ?? serial, issue, channel } }),
    { success: "Ticket opened", invalidate: ["tickets"], onSuccess: (t: any) => nav(`/tickets/${t.id}`), silentError: true });
  const err = create.error as ApiError | null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} wide title="Log a breakdown" description="Search by the serial on the device. Warranty status is worked out automatically."
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!match || issue.trim().length < 5} loading={create.isPending} onClick={() => create.mutate()}>Open ticket</Button></>}>
      {err && <div className="mb-4"><Callout tone="bad" title="Couldn't open the ticket">{err.message}</Callout></div>}
      <div className="space-y-4">
        <Field label="Serial number"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9 uppercase" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="e.g. GRW3K-2024LEG0007" autoFocus /></div></Field>
        {match && (
          <div className="flex items-center gap-4 rounded-md border border-line p-4">
            {match.in_warranty ? <ShieldCheck className="h-8 w-8 text-ok" /> : <ShieldX className="h-8 w-8 text-bad" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{match.product.name}</p>
              <p className="text-sm text-muted">{match.customer ? `${match.customer.name}, ${match.customer.phone}` : "Not delivered to a customer"}</p>
            </div>
            <Badge tone={match.in_warranty ? "ok" : "bad"}>{match.warranty_end ? (match.in_warranty ? `In warranty to ${date(match.warranty_end)}` : `Expired ${date(match.warranty_end)}`) : "No warranty"}</Badge>
          </div>
        )}
        {dSerial.length >= 4 && !lookup.isFetching && !match && <p className="text-sm text-muted">No delivered unit matches that serial yet.</p>}
        <Field label="How did it come in?"><Select value={channel} onChange={(e) => setChannel(e.target.value)}><option value="phone">Phone call</option><option value="walk_in">Walk-in</option></Select></Field>
        <Field label="What's wrong?"><Textarea value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="No generation since the rain, inverter shows E-03" /></Field>
      </div>
    </Dialog>
  );
}

export function TicketsList() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("open,assigned,in_progress");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, status]);
  const overdue = status === "overdue";
  const list = useList("tickets", "/tickets", { q: dq, status: overdue ? "" : status, overdue: overdue || undefined, page, page_size: 20 });
  return (
    <>
      <PageHeader title="Service tickets" description="Breakdowns tracked until the customer confirms the fix. MNRE expects repairs within 15 days."
        actions={can(user, "support") && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Log a breakdown</Button>} />
      <DataTable rowKey={(r: any) => r.id} rows={list.data?.items} loading={list.isLoading} error={list.error} onRetry={list.refetch}
        page={page} pageSize={20} total={list.data?.total} onPage={setPage} onRowClick={(r: any) => nav(`/tickets/${r.id}`)}
        rowClassName={(r: any) => (r.overdue ? "bg-bad-soft/40" : undefined)}
        toolbar={<>
          <SearchInput value={q} onChange={setQ} placeholder="Ticket, customer, phone or serial" />
          <FilterChips value={status} onChange={setStatus} options={[{ value: "open,assigned,in_progress", label: "Open" }, { value: "overdue", label: "Overdue" },
            { value: "open", label: "Unassigned" }, { value: "resolved", label: "Awaiting confirmation" }, { value: "closed", label: "Closed" }]} />
        </>}
        empty={<EmptyState title="No tickets here" description="Customers can also raise a ticket by scanning the QR sticker on their inverter." icon={<QrCode className="h-5 w-5" />} />}
        columns={[
          { key: "n", header: "Ticket", cell: (r: any) => <div><span className="font-medium">{r.number}</span><span className="block text-sm text-muted">{CHANNEL[r.channel]}, {relative(r.created_at)}</span></div> },
          { key: "c", header: "Customer", cell: (r: any) => <div>{r.customer.name}<span className="block text-sm text-muted">{r.customer.phone}</span></div> },
          { key: "u", header: "Unit", hideOnMobile: true, cell: (r: any) => r.unit ? <div className="text-sm">{r.unit.serial_no}<span className="block text-muted">{r.unit.product.name}</span></div> : "—" },
          { key: "w", header: "Warranty", cell: (r: any) => <Badge tone={r.in_warranty ? "ok" : "warn"} dot={false}>{r.in_warranty ? "Free repair" : "Billable"}</Badge> },
          { key: "s", header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
          { key: "d", header: "Deadline", align: "right", cell: (r: any) => <Deadline t={r} /> },
        ]} />
      {creating && <NewTicket onClose={() => setCreating(false)} />}
    </>
  );
}

function AddLine({ ticket, onClose }: { ticket: any; onClose: () => void }) {
  const products = useQuery({ queryKey: ["products"], queryFn: () => api<any[]>("/products", { query: { active: true } }) });
  const [labour, setLabour] = useState(false);
  const [f, setF] = useState({ product_id: "", replacement_serial: "", qty: "1", description: "" });
  const p = products.data?.find((x) => x.id === Number(f.product_id));
  const add = useAction(() => api(`/tickets/${ticket.id}/lines`, { body: labour ? { is_labour: true, qty: Number(f.qty), description: f.description || "Labour" }
    : { product_id: Number(f.product_id), qty: Number(f.qty), replacement_serial: f.replacement_serial || undefined, description: f.description || undefined } }),
    { success: "Added to the ticket", invalidate: ["ticket"], onSuccess: onClose, silentError: true });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Add parts or labour" description={ticket.in_warranty ? "In warranty: the customer pays nothing, but the cost still counts against the job." : "Out of warranty: an invoice is raised automatically when the ticket is resolved."}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={add.isPending} onClick={() => add.mutate()}>Add</Button></>}>
      {add.error && <div className="mb-4"><Callout tone="bad" title="Couldn't add that">{(add.error as ApiError).message}</Callout></div>}
      <div className="space-y-4">
        <Toggle checked={labour} onChange={setLabour} label="Labour hours" description="Off to add a part from stock" />
        {!labour && <Field label="Part"><Select value={f.product_id} onChange={(e) => setF({ ...f, product_id: e.target.value })}><option value="">Choose a part</option>
          {products.data?.filter((x) => x.category !== "service").map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>}
        {!labour && p?.is_serialized && <Field label="Replacement serial" hint="The new unit gets its own warranty from today"><Input className="uppercase" value={f.replacement_serial} onChange={(e) => setF({ ...f, replacement_serial: e.target.value })} /></Field>}
        <Field label={labour ? "Hours" : "Quantity"}><Input type="number" step={labour ? 0.5 : 1} min={0.5} value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="Description"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={labour ? "Diagnosis and repair" : "Optional"} /></Field>
      </div>
    </Dialog>
  );
}

export function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ["ticket", id], queryFn: () => api(`/tickets/${id}`) });
  const techs = useQuery({ queryKey: ["users", "technician"], queryFn: () => api<any[]>("/users", { query: { role: "technician" } }) });
  const [adding, setAdding] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const inv = ["ticket", "tickets", "dashboard"];
  const patch = useAction((body: any) => api(`/tickets/${id}`, { method: "PATCH", body: { ...body, version: q.data?.version } }), { success: "Ticket updated", invalidate: inv });
  const resolve = useAction(() => api(`/tickets/${id}/resolve`, { body: {} }), { success: (t: any) => (t.invoice ? `Resolved. Invoice ${t.invoice.number} raised.` : "Resolved. No charge to the customer."), invalidate: [...inv, "invoices"], silentError: true });
  const close = useAction(() => api(`/tickets/${id}/close`, { body: { customer_confirmed: confirmed } }), { success: "Ticket closed", invalidate: inv });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error) return <EmptyState tone="bad" title="Couldn't open this ticket" description={(q.error as Error).message} />;
  const t = q.data;
  const active = ["assigned", "in_progress"].includes(t.status);
  const err = resolve.error as ApiError | null;
  return (
    <>
      <PageHeader crumbs={[{ label: "Service tickets", to: "/tickets" }]} title={t.number} description={t.issue}
        meta={<><Deadline t={t} /><Badge tone={t.in_warranty ? "ok" : "warn"}>{t.in_warranty ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}{t.in_warranty ? "In warranty: free repair" : "Out of warranty: billable"}</Badge>
          <span className="text-sm text-muted">Raised by {CHANNEL[t.channel]?.toLowerCase()}, {relative(t.created_at)}</span></>}
        actions={<>
          {active && <Button onClick={() => setAdding(true)}><Wrench className="h-4 w-4" /> Add parts or labour</Button>}
          {t.status === "in_progress" && <Button variant="primary" loading={resolve.isPending} onClick={() => resolve.mutate()}><CheckCircle2 className="h-4 w-4" /> Resolve</Button>}
        </>} />
      <div className="mb-6"><StatusStepper stages={STAGES.ticket} current={t.status} /></div>
      {err && <div className="mb-4"><Callout tone="bad" title="Not ready to resolve">{err.message}</Callout></div>}
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {t.status === "resolved" && (
            <Card className="p-5">
              <h2 className="font-semibold">Close once the customer confirms</h2>
              <p className="mb-3 text-sm text-muted">Call the customer and check the system is generating again.</p>
              <div className="flex flex-wrap items-center gap-4">
                <Toggle checked={confirmed} onChange={setConfirmed} label="Customer confirmed the fix" />
                <Button variant="primary" disabled={!confirmed} loading={close.isPending} onClick={() => close.mutate()}>Close ticket</Button>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Parts and labour" description={t.in_warranty ? "Customer pays nothing; these are the company's costs." : "Billed to the customer when resolved."} />
            {t.lines.length ? (
              <table className="w-full text-base">
                <tbody>
                  {t.lines.map((l: any) => (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5">{l.description}<span className="block text-sm text-muted">{l.is_labour ? `${l.qty} h` : `${l.qty} pcs`}</span></td>
                      <td className="num px-3 py-2.5 text-right text-muted">Cost {money(l.unit_cost * l.qty)}</td>
                      <td className="num px-5 py-2.5 text-right">{t.in_warranty ? <span className="text-muted line-through">{money(l.line_total)}</span> : money(l.line_total)}</td>
                    </tr>
                  ))}
                  <tr><td className="px-5 py-3 font-semibold">Customer pays</td><td className="num px-3 py-3 text-right text-muted">Company cost {money(t.company_cost)}</td>
                    <td className="num px-5 py-3 text-right text-lg font-semibold">{money(t.customer_total)}</td></tr>
                </tbody>
              </table>
            ) : <EmptyState title="Nothing recorded yet" description="Add the parts used and hours spent." />}
          </Card>
          <Card>
            <CardHeader title="After-repair photo" description="Geo-tagged proof of the fix is required before resolving" />
            <div className="p-5">
              {active ? <PhotoCapture endpoint={`/tickets/${t.id}/photos`} existing={t.photos} onUploaded={() => q.refetch()} kinds={[{ value: "after_repair", label: "After repair" }]} />
                : t.photos.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{t.photos.map((p: any) => <img key={p.id} src={p.url} alt="After repair" className="aspect-[4/3] w-full rounded object-cover" />)}</div>
                : <p className="text-sm text-muted">Assign and start the ticket to add photos.</p>}
            </div>
          </Card>
          <Card><CardHeader title="Activity" /><div className="px-5 py-4"><ActivityTimeline entity="ticket" id={t.id} /></div></Card>
        </div>
        <div className="space-y-6">
          <Card className="px-5 py-4">
            <h2 className="mb-3 font-semibold">Assignment</h2>
            {can(user, "support") && !["resolved", "closed"].includes(t.status) ? (
              <div className="space-y-3">
                <Select value={t.assigned_to ?? ""} onChange={(e) => patch.mutate({ assigned_to: Number(e.target.value) })} aria-label="Technician">
                  <option value="" disabled>Assign a technician</option>{techs.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
                {t.status === "assigned" && <Button className="w-full justify-center" onClick={() => patch.mutate({ status: "in_progress" })}>Start work</Button>}
              </div>
            ) : <p>{t.technician?.name ?? "Not assigned"}</p>}
          </Card>
          <Card className="px-5 py-4">
            <Spec className="sm:grid-cols-1" items={[
              ["Customer", `${t.customer.name}, ${t.customer.phone}`],
              ["Unit", t.unit ? `${t.unit.serial_no}, ${t.unit.product.name}` : "—"],
              ["Installed", date(t.unit?.delivered_at)], ["Warranty until", date(t.unit?.warranty_end)],
              ["Due by", dateTime(t.due_by)],
              ["Invoice", t.invoice ? <button key="i" className="text-cell hover:underline" onClick={() => nav(`/invoices/${t.invoice.id}`)}>{t.invoice.number}, {money(t.invoice.total)}</button> : "None"],
            ]} />
          </Card>
        </div>
      </div>
      {adding && <AddLine ticket={t} onClose={() => setAdding(false)} />}
    </>
  );
}
