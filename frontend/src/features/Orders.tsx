import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Ban, Leaf, Plus, Printer, QrCode, Send, ShieldCheck, Trash2, Truck } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { date, money, number, relative } from "@/lib/format";
import { useAction, useDebounced, useList } from "@/lib/hooks";
import { STAGES, STAGE_LABEL } from "@/lib/status";
import { uid } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, FilterChips, SearchInput } from "@/components/shared/DataTable";
import { StatusStepper } from "@/components/shared/StatusStepper";
import { ActivityTimeline } from "@/components/shared/Activity";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge, Callout, Card, CardHeader, Skeleton, StatusBadge } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

export function OrdersList() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, status]);
  const list = useList("orders", "/orders", { q: dq, status, page, page_size: 20 });
  return (
    <>
      <PageHeader title="Quotes and orders" description="Each order is built from a kit template, so every part is listed. Confirming reserves stock and starts the paperwork." />
      <DataTable rowKey={(r: any) => r.id} rows={list.data?.items} loading={list.isLoading} error={list.error} onRetry={list.refetch}
        page={page} pageSize={20} total={list.data?.total} onPage={setPage} onRowClick={(r: any) => nav(`/orders/${r.id}`)}
        toolbar={<>
          <SearchInput value={q} onChange={setQ} placeholder="Order number, customer or phone" />
          <FilterChips value={status} onChange={setStatus} options={[
            { value: "", label: "All" }, { value: "draft,sent", label: "Quotes" }, { value: "confirmed", label: "Confirmed" },
            { value: "dispatched,delivered", label: "On the way" }, { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }]} />
        </>}
        empty={<EmptyState title="No orders match" description="Quotes are created from a lead with an approved site survey." />}
        columns={[
          { key: "n", header: "Order", cell: (r: any) => <span className="font-medium">{r.number}</span> },
          { key: "c", header: "Customer", cell: (r: any) => <div>{r.customer.name}<span className="block text-sm text-muted">{r.customer.city}</span></div> },
          { key: "k", header: "System", hideOnMobile: true, cell: (r: any) => <span>{r.kit.name}{r.is_subsidy && <Badge tone="cell" className="ml-2" dot={false}>Subsidy</Badge>}</span> },
          { key: "s", header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
          { key: "t", header: "Total", align: "right", cell: (r: any) => <span className="num font-medium">{money(r.total)}</span> },
          { key: "d", header: "Created", align: "right", hideOnMobile: true, cell: (r: any) => <span className="text-muted">{relative(r.created_at)}</span> },
        ]} />
    </>
  );
}

function PaybackCard({ p, total }: { p: any; total: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line bg-sun-soft/40 px-5 py-3">
        <Leaf className="h-4 w-4 text-[rgb(var(--warn))]" /><h2 className="font-semibold">What this system saves</h2>
      </div>
      <div className="px-5 py-4">
        <p className="num text-2xl font-semibold tracking-tight">{p.payback_years ?? "—"} years</p>
        <p className="text-sm text-muted">to pay for itself, after the subsidy</p>
        <dl className="mt-4 space-y-2 text-base">
          {[["Generates per year", `${number(p.yearly_units)} units`], ["Saves per month", money(p.monthly_savings)], ["System price", money(total)],
            ["Subsidy to customer's bank", p.expected_subsidy ? `− ${money(p.expected_subsidy)}` : "None"], ["Net cost", money(p.net_cost)],
            ["Savings over 25 years", money(p.lifetime_savings_25y)]].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="num font-medium">{v}</dd></div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-faint">Estimate uses the generation and tariff values in Settings.</p>
      </div>
    </Card>
  );
}

function LinesEditor({ order, onDone }: { order: any; onDone: () => void }) {
  const products = useQuery({ queryKey: ["products"], queryFn: () => api<any[]>("/products", { query: { active: true } }) });
  const [lines, setLines] = useState(order.lines.map((l: any) => ({ product_id: l.product.id, qty: l.qty, unit_price: l.unit_price })));
  const [subsidy, setSubsidy] = useState(order.is_subsidy);
  const [sanctioned, setSanctioned] = useState(order.sanctioned_kw ?? order.capacity_kw);
  const save = useAction(() => api(`/orders/${order.id}`, { method: "PATCH", body: { version: order.version, is_subsidy: subsidy, sanctioned_kw: subsidy ? Number(sanctioned) : undefined,
    lines: lines.map((l: any) => ({ product_id: Number(l.product_id), qty: Number(l.qty), unit_price: Number(l.unit_price) })) } }),
    { success: "Quote updated", invalidate: ["order", "orders"], onSuccess: onDone });
  const byId = Object.fromEntries((products.data ?? []).map((p) => [p.id, p]));
  const total = lines.reduce((s: number, l: any) => s + Number(l.qty) * Number(l.unit_price), 0);
  const err = save.error as ApiError | null;
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()} wide title={`Edit ${order.number}`} description="Change quantities, prices or parts. Subsidy orders can only use DCR panels."
      footer={<><span className="num mr-auto self-center font-semibold">{money(total)}</span><Button onClick={onDone}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save quote</Button></>}>
      {err?.code === "NON_DCR_PANEL_IN_SUBSIDY_ORDER" && <div className="mb-4"><Callout tone="bad" title="Non-DCR panel in a subsidy order">{err.message}</Callout></div>}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Field label="Order type"><Select value={subsidy ? "yes" : "no"} onChange={(e) => setSubsidy(e.target.value === "yes")}>
          <option value="yes">PM Surya Ghar subsidy</option><option value="no">No subsidy</option></Select></Field>
        {subsidy && <Field label="Sanctioned capacity (kW)" hint="Installed capacity can't exceed this"><Input type="number" step={0.5} value={sanctioned} onChange={(e) => setSanctioned(e.target.value)} /></Field>}
      </div>
      <div className="space-y-2">
        {lines.map((l: any, i: number) => (
          <div key={i} className="grid grid-cols-[1fr_72px_110px_36px] items-center gap-2">
            <Select value={l.product_id} onChange={(e) => { const p = byId[Number(e.target.value)]; setLines(lines.map((x: any, j: number) => j === i ? { ...x, product_id: Number(e.target.value), unit_price: p?.sale_price ?? x.unit_price } : x)); }} aria-label="Product">
              {(products.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.category === "panel" ? (p.is_dcr ? " · DCR" : " · non-DCR") : ""}</option>)}
            </Select>
            <Input type="number" min={1} value={l.qty} onChange={(e) => setLines(lines.map((x: any, j: number) => j === i ? { ...x, qty: e.target.value } : x))} aria-label="Quantity" />
            <Input type="number" min={0} value={l.unit_price} onChange={(e) => setLines(lines.map((x: any, j: number) => j === i ? { ...x, unit_price: e.target.value } : x))} aria-label="Unit price" />
            <Button variant="ghost" size="icon" aria-label="Remove line" onClick={() => setLines(lines.filter((_: any, j: number) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <Button className="mt-3" size="sm" variant="ghost" onClick={() => setLines([...lines, { product_id: products.data?.[0]?.id, qty: 1, unit_price: products.data?.[0]?.sale_price ?? 0 }])}><Plus className="h-4 w-4" /> Add line</Button>
    </Dialog>
  );
}

function ConfirmOrderDialog({ order, onDone }: { order: any; onDone: () => void }) {
  const [amount, setAmount] = useState(String(Math.round(order.total * 0.4)));
  const [method, setMethod] = useState("upi");
  const [reference, setReference] = useState("");
  const [key] = useState(uid());  // same key on retry => never confirmed twice
  const confirm = useAction(() => api(`/orders/${order.id}/confirm`, { body: { advance_amount: Number(amount), method, reference: reference || null }, idempotent: key }),
    { success: "Order confirmed. Stock reserved, pick list, crew job and invoice created.", invalidate: ["order", "orders", "pick-lists", "jobs"], onSuccess: onDone, silentError: true });
  const err = confirm.error as ApiError | null;
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()} title={`Confirm ${order.number}`} description="Record the advance. In one step this reserves stock, sends a pick list to the warehouse, puts the job on the crew's schedule, raises the invoice and opens the subsidy case."
      footer={<><Button onClick={onDone}>Cancel</Button><Button variant="primary" loading={confirm.isPending} onClick={() => confirm.mutate()}><BadgeCheck className="h-4 w-4" /> Confirm order</Button></>}>
      {err && <div className="mb-4"><Callout tone="bad" title={err.code === "INSUFFICIENT_STOCK" ? "Not enough stock" : "Couldn't confirm"}>
        {err.message}
        {err.code === "INSUFFICIENT_STOCK" && <p className="mt-1">Nothing was reserved. Receive a purchase or edit the quote, then try again.</p>}
      </Callout></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Advance received (₹)" hint={`Minimum 30%: ${money(order.total * 0.3)}. Full amount: ${money(order.total)}.`}>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Paid by"><Select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="cheque">Cheque</option><option value="cash">Cash</option><option value="card">Card</option></Select></Field>
        <Field label="Reference (UTR or cheque no.)" className="sm:col-span-2"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setAmount(String(Math.round(order.total * 0.5)))}>50%</Button>
        <Button size="sm" variant="ghost" onClick={() => setAmount(String(order.total))}>Full amount</Button>
      </div>
    </Dialog>
  );
}

export function QrSheet() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["qr", id], queryFn: () => api(`/orders/${id}/qr-sheet`) });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error) return <EmptyState tone="bad" title="No stickers yet" description={(q.error as Error).message} />;
  return (
    <>
      <PageHeader crumbs={[{ label: "Orders", to: "/orders" }, { label: q.data.order, to: `/orders/${id}` }]} title="QR stickers"
        description={`Print and stick one on each serial-tracked unit for ${q.data.customer}. Scanning opens the warranty page and the complaint form.`}
        actions={<Button variant="primary" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print stickers</Button>} />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
        {q.data.units.map((u: any) => (
          <div key={u.serial_no} className="break-inside-avoid rounded-md border border-dashed border-line-strong bg-surface p-4 text-center">
            <img src={u.qr_url} alt={`QR code for ${u.serial_no}`} className="mx-auto h-32 w-32 rounded bg-white p-1" />
            <p className="mt-2 text-sm font-semibold">{u.serial_no}</p>
            <p className="text-xs text-muted">{u.product}</p>
            <p className="text-xs text-muted">Warranty to {date(u.warranty_end)}</p>
            <a href={u.link} target="_blank" rel="noreferrer" className="no-print mt-2 inline-block text-xs font-medium text-cell hover:underline">Open page</a>
          </div>
        ))}
      </div>
    </>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["order", id], queryFn: () => api(`/orders/${id}`) });
  const [dialog, setDialog] = useState<null | "edit" | "confirm" | "cancel" | "send">(null);
  const [reason, setReason] = useState("");
  const send = useAction(() => api(`/orders/${id}/send`, { body: {} }), { success: "Quote sent", invalidate: ["order", "orders"], onSuccess: () => setDialog(null) });
  const cancel = useAction(() => api(`/orders/${id}/cancel`, { body: { reason } }), { success: "Order cancelled. Reservations released.", invalidate: ["order", "orders"], onSuccess: () => setDialog(null) });
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-16 w-1/2" /><Skeleton className="h-80" /></div>;
  if (q.error) return <EmptyState tone="bad" title="Couldn't open this order" description={(q.error as Error).message} />;
  const o = q.data;
  const sales = can(user, "sales");
  const editable = sales && ["draft", "sent"].includes(o.status);
  const stages = o.includes_installation ? STAGES.order : STAGES.order.filter((s) => s !== "installed");
  return (
    <>
      <PageHeader crumbs={[{ label: "Orders", to: "/orders" }]} title={o.number}
        description={<><Link className="hover:underline" to={`/leads/${o.lead_id}`}>{o.customer.name}</Link>, {o.customer.city}. {o.kit.name}{o.includes_installation ? "" : ", delivered without installation"}.</>}
        meta={<>{o.is_subsidy && <Badge tone="cell"><ShieldCheck className="h-3.5 w-3.5" /> PM Surya Ghar, sanctioned {o.sanctioned_kw} kW</Badge>}</>}
        actions={<>
          {editable && <Button onClick={() => setDialog("edit")}>Edit quote</Button>}
          {sales && o.status === "draft" && <Button loading={send.isPending} onClick={() => send.mutate()}><Send className="h-4 w-4" /> Send quote</Button>}
          {editable && <Button variant="primary" onClick={() => setDialog("confirm")}><BadgeCheck className="h-4 w-4" /> Confirm order</Button>}
          {o.units.some((u: any) => u.qr_token) && <Button onClick={() => nav(`/orders/${o.id}/qr`)}><QrCode className="h-4 w-4" /> QR stickers</Button>}
          {o.pick_list && can(user, "warehouse") && o.status === "confirmed" && <Button variant="primary" onClick={() => nav(`/dispatch/${o.pick_list.id}`)}><Truck className="h-4 w-4" /> Open pick list</Button>}
          {sales && ["draft", "sent", "confirmed"].includes(o.status) && <Button variant="ghost" onClick={() => setDialog("cancel")}><Ban className="h-4 w-4" /> Cancel</Button>}
        </>} />
      <div className="mb-6"><StatusStepper stages={stages} current={o.status === "installed" ? "completed" : o.status} terminal={{ status: "cancelled", label: "Cancelled" }} /></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Parts and services" description={`${o.lines.length} lines from the ${o.kit.name} kit`} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead><tr className="border-b border-line text-left text-sm text-muted">
                  <th className="px-5 py-2 font-medium">Item</th><th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Unit price</th><th className="px-5 py-2 text-right font-medium">Amount</th></tr></thead>
                <tbody>
                  {o.lines.map((l: any) => (
                    <tr key={l.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5"><span className="font-medium">{l.product.name}</span>
                        <span className="ml-2 inline-flex gap-1 align-middle">
                          {l.product.category === "panel" && (l.product.is_dcr ? <Badge tone="ok" dot={false}>DCR</Badge> : <Badge tone="warn" dot={false}>Non-DCR</Badge>)}
                          {l.product.is_serialized && <Badge dot={false}>Serial-tracked</Badge>}
                        </span></td>
                      <td className="num px-3 py-2.5 text-right">{l.qty}</td>
                      <td className="num px-3 py-2.5 text-right text-muted">{money(l.unit_price)}</td>
                      <td className="num px-5 py-2.5 text-right">{money(l.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  {o.tax > 0 && <tr><td colSpan={3} className="px-5 pt-3 text-right text-muted">Tax</td><td className="num px-5 pt-3 text-right">{money(o.tax)}</td></tr>}
                  <tr><td colSpan={3} className="px-5 py-3 text-right font-semibold">Total</td><td className="num px-5 py-3 text-right text-lg font-semibold">{money(o.total)}</td></tr>
                </tfoot>
              </table>
            </div>
          </Card>
          {o.units.length > 0 && (
            <Card>
              <CardHeader title="Serial-tracked units" description="Reserved at confirmation. Warranty starts the moment the order is delivered." />
              <DataTableLite units={o.units} />
            </Card>
          )}
          <Card><CardHeader title="Activity" /><div className="px-5 py-4"><ActivityTimeline entity="order" id={o.id} /></div></Card>
        </div>
        <div className="space-y-6">
          <PaybackCard p={o.payback} total={o.total} />
          {(o.invoice || o.job || o.subsidy_case || o.pick_list) && (
            <Card>
              <CardHeader title="Created automatically" description="On confirmation, in one transaction" />
              <ul className="divide-y divide-line">
                {o.pick_list && <LinkRow to={can(user, "warehouse") ? `/dispatch/${o.pick_list.id}` : undefined} label="Warehouse pick list" status={o.pick_list.status} />}
                {o.job && <LinkRow to={`/jobs/${o.job.id}`} label="Installation job" status={o.job.status} />}
                {o.invoice && <LinkRow to={can(user, "accounts", "sales") ? `/invoices/${o.invoice.id}` : undefined} label={`Invoice ${o.invoice.number}`} status={o.invoice.status}
                  note={`${money(o.invoice.amount_paid)} of ${money(o.invoice.total)} paid`} />}
                {o.subsidy_case && <LinkRow to="/subsidy" label="Subsidy case" status={o.subsidy_case.stage} note={o.subsidy_case.application_no ?? "Application number pending"} />}
              </ul>
            </Card>
          )}
        </div>
      </div>
      {dialog === "edit" && <LinesEditor order={o} onDone={() => setDialog(null)} />}
      {dialog === "confirm" && <ConfirmOrderDialog order={o} onDone={() => setDialog(null)} />}
      <Dialog open={dialog === "cancel"} onOpenChange={(v) => !v && setDialog(null)} title={`Cancel ${o.number}`} description="Reserved units go back into stock and the crew job is cancelled."
        footer={<><Button onClick={() => setDialog(null)}>Keep order</Button><Button variant="danger" disabled={reason.trim().length < 3} loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel order</Button></>}>
        <Field label="Reason"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </Dialog>
      <ConfirmDialog open={dialog === "send"} onOpenChange={(v) => !v && setDialog(null)} title="Send quote" description="Mark the quote as sent to the customer." confirmLabel="Send quote" onConfirm={() => send.mutate()} />
    </>
  );
}

function LinkRow({ to, label, status, note }: { to?: string; label: string; status: string; note?: string }) {
  const body = (
    <span className="flex w-full items-center gap-3 px-5 py-3">
      <span className="min-w-0 flex-1"><span className="block font-medium">{label}</span>{note && <span className="block truncate text-sm text-muted">{note}</span>}</span>
      <StatusBadge status={status} />
    </span>
  );
  return <li>{to ? <Link to={to} className="block hover:bg-sunken/60">{body}</Link> : body}</li>;
}

function DataTableLite({ units }: { units: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-base">
        <thead><tr className="border-b border-line text-left text-sm text-muted"><th className="px-5 py-2 font-medium">Serial</th><th className="px-3 py-2 font-medium">Product</th>
          <th className="px-3 py-2 font-medium">Status</th><th className="px-5 py-2 text-right font-medium">Warranty until</th></tr></thead>
        <tbody>{units.map((u) => (
          <tr key={u.id} className="border-b border-line last:border-0">
            <td className="px-5 py-2 font-medium">{u.serial_no}</td><td className="px-3 py-2 text-muted">{u.product.name}</td>
            <td className="px-3 py-2"><StatusBadge status={u.status} /></td>
            <td className="px-5 py-2 text-right">{u.warranty_end ? <span className={u.in_warranty ? "" : "text-bad"}>{date(u.warranty_end)}</span> : <span className="text-faint">Starts on delivery</span>}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

export { STAGE_LABEL };
