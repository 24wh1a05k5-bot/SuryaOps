import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PackagePlus, Plus, ScanLine, Trash2, Truck, Undo2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { date, humanize, money, number, relative } from "@/lib/format";
import { useAction, useDebounced, useList } from "@/lib/hooks";
import { STAGES } from "@/lib/status";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, FilterChips, SearchInput } from "@/components/shared/DataTable";
import { StatusStepper } from "@/components/shared/StatusStepper";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge, Callout, Card, CardHeader, Skeleton, StatusBadge } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/form";

/* ---------------- Purchases ---------------- */

type PurchaseDraft = { supplier: string; lines: { product_id: string; qty: string; unit_cost: string }[] };

function NewPurchase({ onClose, initial }: { onClose: () => void; initial?: PurchaseDraft }) {
  const nav = useNavigate();
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => api<any[]>("/suppliers") });
  const products = useQuery({ queryKey: ["products"], queryFn: () => api<any[]>("/products", { query: { active: true } }) });
  const stockable = (products.data ?? []).filter((p) => p.category !== "service");
  const [supplier, setSupplier] = useState(initial?.supplier ?? "");
  const [lines, setLines] = useState<{ product_id: string; qty: string; unit_cost: string }[]>(initial?.lines ?? [{ product_id: "", qty: "1", unit_cost: "" }]);
  const create = useAction(() => api("/purchases", { body: { supplier_id: Number(supplier), lines: lines.map((l) => ({ product_id: Number(l.product_id), qty: Number(l.qty), unit_cost: Number(l.unit_cost) })) } }),
    { success: "Purchase created", invalidate: ["purchases"], onSuccess: (p: any) => nav(`/purchases/${p.id}`) });
  const total = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.unit_cost || 0), 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} wide title={initial ? "Reorder low stock" : "New purchase"}
      description={initial ? "Pre-filled to bring each item back to twice its reorder level. Change anything before creating." : "Stock you're buying from a supplier. Serial numbers are entered when the goods arrive."}
      footer={<><span className="num mr-auto self-center font-semibold">{money(total)}</span><Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!supplier || lines.some((l) => !l.product_id)} loading={create.isPending} onClick={() => create.mutate()}>Create purchase</Button></>}>
      <Field label="Supplier"><Select value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">Choose a supplier</option>
        {suppliers.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
      <div className="mt-4 space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_72px_120px_36px] gap-2">
            <Select value={l.product_id} aria-label="Product" onChange={(e) => { const p = stockable.find((x) => x.id === Number(e.target.value)); setLines(lines.map((x, j) => j === i ? { ...x, product_id: e.target.value, unit_cost: String(p?.cost_price ?? "") } : x)); }}>
              <option value="">Product</option>{stockable.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            <Input type="number" min={1} aria-label="Quantity" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))} />
            <Input type="number" min={0} aria-label="Unit cost" placeholder="Unit cost" value={l.unit_cost} onChange={(e) => setLines(lines.map((x, j) => j === i ? { ...x, unit_cost: e.target.value } : x))} />
            <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
      <Button className="mt-3" size="sm" variant="ghost" onClick={() => setLines([...lines, { product_id: "", qty: "1", unit_cost: "" }])}><Plus className="h-4 w-4" /> Add line</Button>
    </Dialog>
  );
}

export function PurchasesList() {
  const nav = useNavigate();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const list = useList("purchases", "/purchases", { status, page, page_size: 20 });
  return (
    <>
      <PageHeader title="Purchases" description="Stock coming in from suppliers. Receiving a purchase records every serial number, so dispatch can check them later."
        actions={<Button variant="primary" onClick={() => setCreating(true)}><PackagePlus className="h-4 w-4" /> New purchase</Button>} />
      <DataTable rowKey={(r: any) => r.id} rows={list.data?.items} loading={list.isLoading} error={list.error} onRetry={list.refetch}
        page={page} pageSize={20} total={list.data?.total} onPage={setPage} onRowClick={(r: any) => nav(`/purchases/${r.id}`)}
        toolbar={<FilterChips value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "", label: "All" }, { value: "draft", label: "Draft" }, { value: "ordered", label: "Ordered" }, { value: "received", label: "Received" }]} />}
        columns={[
          { key: "n", header: "Purchase", cell: (r: any) => <span className="font-medium">{r.number}</span> },
          { key: "s", header: "Supplier", cell: (r: any) => r.supplier.name },
          { key: "st", header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
          { key: "r", header: "Received", hideOnMobile: true, cell: (r: any) => (r.received_at ? date(r.received_at) : "—") },
          { key: "t", header: "Total", align: "right", cell: (r: any) => <span className="num">{money(r.total)}</span> },
        ]} />
      {creating && <NewPurchase onClose={() => setCreating(false)} />}
    </>
  );
}

export function PurchaseDetail() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["purchase", id], queryFn: () => api(`/purchases/${id}`) });
  const [serials, setSerials] = useState<Record<number, string>>({});
  const [confirming, setConfirming] = useState(false);
  const order = useAction(() => api(`/purchases/${id}/order`, { body: {} }), { success: "Marked as ordered", invalidate: ["purchase", "purchases"] });
  const receive = useAction(() => api(`/purchases/${id}/receive`, { body: { lines: (q.data?.lines ?? []).map((l: any) => ({ line_id: l.id, serials: (serials[l.id] ?? "").split(/[\s,]+/).filter(Boolean) })) } }),
    { success: "Goods received. Stock and serials updated.", invalidate: ["purchase", "purchases", "stock"], onSuccess: () => setConfirming(false), silentError: true });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error) return <EmptyState tone="bad" title="Couldn't open this purchase" description={(q.error as Error).message} />;
  const p = q.data;
  const open = p.status !== "received" && p.status !== "cancelled";
  const err = receive.error as ApiError | null;
  const count = (lid: number) => (serials[lid] ?? "").split(/[\s,]+/).filter(Boolean).length;
  return (
    <>
      <PageHeader crumbs={[{ label: "Purchases", to: "/purchases" }]} title={p.number} description={`${p.supplier.name}. ${money(p.total)}.`}
        actions={<>
          {p.status === "draft" && <Button loading={order.isPending} onClick={() => order.mutate()}>Mark as ordered</Button>}
          {open && <Button variant="primary" onClick={() => setConfirming(true)}><CheckCircle2 className="h-4 w-4" /> Receive goods</Button>}
        </>} />
      <div className="mb-6"><StatusStepper stages={STAGES.purchase} current={p.status} /></div>
      {err && <div className="mb-4"><Callout tone="bad" title={err.code === "DUPLICATE_SERIAL" ? "Duplicate serial numbers" : "Can't receive yet"}>{err.message}</Callout></div>}
      <div className="space-y-4">
        {p.lines.map((l: any) => (
          <Card key={l.id}>
            <CardHeader title={l.product.name} description={`${l.qty} ${l.product.unit} at ${money(l.unit_cost)}${l.product.is_serialized ? ". Serial-tracked: enter one serial per unit." : ""}`}
              actions={l.product.is_serialized && open && <Badge tone={count(l.id) === l.qty ? "ok" : "warn"}>{count(l.id)} of {l.qty} serials</Badge>} />
            {l.product.is_serialized && (
              <div className="px-5 py-4">
                {open ? (
                  <Textarea rows={3} className="font-medium uppercase" placeholder="Scan or type serials, one per line or separated by commas"
                    value={serials[l.id] ?? ""} onChange={(e) => setSerials({ ...serials, [l.id]: e.target.value })} />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {p.units.filter((u: any) => u.line_id === l.id).map((u: any) => <Badge key={u.serial_no} dot={false}>{u.serial_no}</Badge>)}
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
      <ConfirmDialog open={confirming} onOpenChange={setConfirming} title="Receive these goods?" loading={receive.isPending} confirmLabel="Receive goods"
        description="Stock is added and serial numbers are recorded. A received purchase can't be edited afterwards." onConfirm={() => receive.mutate()} />
    </>
  );
}

/* ---------------- Stock ---------------- */

/** Like Odoo's Replenishment: items below reorder level, grouped by the supplier we last bought them from. */
function ReorderCard({ low }: { low: any[] }) {
  const { user } = useAuth();
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: () => api<any[]>("/suppliers") });
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const groups = new Map<string, any[]>();
  low.forEach((r) => { const k = String(r.last_supplier_id ?? ""); groups.set(k, [...(groups.get(k) ?? []), r]); });
  const nameOf = (id: string) => suppliers.data?.find((s) => String(s.id) === id)?.name ?? "Choose supplier";
  const open = (sid: string, rows: any[]) => setDraft({ supplier: sid,
    lines: rows.map((r) => ({ product_id: String(r.product_id), qty: String(r.suggested_qty), unit_cost: String(r.cost_price) })) });
  const canBuy = can(user, "warehouse");
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader title={`Running low: ${low.length} item${low.length > 1 ? "s" : ""} below reorder level`}
        description="Suggested quantity brings each item back to twice its reorder level, so confirmed orders never wait for stock." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-base">
          <thead><tr className="border-b border-line text-left text-sm text-muted">
            <th className="px-5 py-2 font-medium">Product</th><th className="px-3 py-2 text-right font-medium">Available</th>
            <th className="px-3 py-2 text-right font-medium">Reorder at</th><th className="px-3 py-2 text-right font-medium">Suggested</th>
            <th className="px-5 py-2 font-medium">Usual supplier</th></tr></thead>
          <tbody>{low.map((r) => (
            <tr key={r.product_id} className="border-b border-line last:border-0">
              <td className="px-5 py-2 font-medium">{r.name}</td>
              <td className="num px-3 py-2 text-right font-semibold text-[rgb(var(--warn))]">{number(r.available)}</td>
              <td className="num px-3 py-2 text-right text-muted">{number(r.reorder_level)}</td>
              <td className="num px-3 py-2 text-right font-semibold">{number(r.suggested_qty)}</td>
              <td className="px-5 py-2 text-muted">{r.last_supplier_id ? nameOf(String(r.last_supplier_id)) : "—"}</td>
            </tr>))}</tbody>
        </table>
      </div>
      {canBuy && (
        <div className="flex flex-wrap gap-2 border-t border-line bg-sunken/40 px-5 py-3">
          {[...groups.entries()].map(([sid, rows]) => (
            <Button key={sid || "none"} variant="primary" onClick={() => open(sid, rows)}>
              <PackagePlus className="h-4 w-4" /> Reorder from {sid ? nameOf(sid) : "a supplier"} ({rows.length})
            </Button>
          ))}
        </div>
      )}
      {draft && <NewPurchase initial={draft} onClose={() => setDraft(null)} />}
    </Card>
  );
}

export function Stock() {
  const [params, setParams] = useSearchParams();
  const [serial, setSerial] = useState(params.get("serial") ?? "");
  const [page, setPage] = useState(1);
  const dSerial = useDebounced(serial);
  useEffect(() => { setPage(1); if (dSerial) setParams({ serial: dSerial }, { replace: true }); }, [dSerial]); // eslint-disable-line react-hooks/exhaustive-deps
  const summary = useQuery({ queryKey: ["stock", "summary"], queryFn: () => api<any[]>("/stock/summary") });
  const units = useList("stock-units", "/stock/units", { serial: dSerial, page, page_size: 15 });
  const value = (summary.data ?? []).reduce((s, r) => s + r.stock_value, 0);
  const low = (summary.data ?? []).filter((r) => r.low_stock);
  return (
    <>
      <PageHeader title="Stock and serials" description={`Stock on hand is worth ${money(value)}. Every inverter, battery, charge controller and panel is tracked by serial number.`} />
      {low.length > 0 && <ReorderCard low={low} />}
      <DataTable dense rowKey={(r: any) => r.product_id} rows={summary.data} loading={summary.isLoading} error={summary.error}
        rowClassName={(r: any) => (r.low_stock ? "bg-warn-soft/50" : undefined)}
        columns={[
          { key: "n", header: "Product", cell: (r: any) => <div><span className="font-medium">{r.name}</span><span className="block text-sm text-muted">{r.sku}</span></div> },
          { key: "c", header: "Type", hideOnMobile: true, cell: (r: any) => <span>{humanize(r.category)}{r.category === "panel" && <Badge tone={r.is_dcr ? "ok" : "warn"} dot={false} className="ml-2">{r.is_dcr ? "DCR" : "Non-DCR"}</Badge>}</span> },
          { key: "t", header: "Tracking", hideOnMobile: true, cell: (r: any) => (r.is_serialized ? "By serial" : "By quantity") },
          { key: "o", header: "On hand", align: "right", cell: (r: any) => <span className="num">{number(r.on_hand)}</span> },
          { key: "r", header: "Reserved", align: "right", cell: (r: any) => <span className="num text-muted">{number(r.reserved)}</span> },
          { key: "a", header: "Available", align: "right", cell: (r: any) => <span className={cn("num font-semibold", r.low_stock && "text-[rgb(var(--warn))]")}>{number(r.available)}</span> },
          { key: "v", header: "Value", align: "right", hideOnMobile: true, cell: (r: any) => <span className="num text-muted">{money(r.stock_value)}</span> },
        ]} />
      <h2 className="mb-3 mt-8 text-md font-semibold">Find a unit by serial</h2>
      <DataTable rowKey={(r: any) => r.id} rows={units.data?.items} loading={units.isLoading} page={page} pageSize={15} total={units.data?.total} onPage={setPage}
        toolbar={<SearchInput value={serial} onChange={setSerial} placeholder="Serial number, e.g. GRW3K" />}
        empty={<EmptyState title="No unit with that serial" description="Check the label, or search for part of the number." />}
        columns={[
          { key: "s", header: "Serial", cell: (r: any) => <span className="font-medium">{r.serial_no}</span> },
          { key: "p", header: "Product", cell: (r: any) => r.product.name },
          { key: "st", header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
          { key: "c", header: "Customer", hideOnMobile: true, cell: (r: any) => r.customer ? <span>{r.customer.name}<span className="block text-sm text-muted">{r.customer.phone}</span></span> : "—" },
          { key: "w", header: "Warranty", align: "right", cell: (r: any) => r.warranty_end
            ? <Badge tone={r.in_warranty ? "ok" : "bad"}>{r.in_warranty ? `Until ${date(r.warranty_end)}` : `Expired ${date(r.warranty_end)}`}</Badge>
            : <span className="text-faint">Not started</span> },
        ]} />
    </>
  );
}

/* ---------------- Dispatch ---------------- */

export function DispatchList() {
  const nav = useNavigate();
  const [status, setStatus] = useState("pending,packed");
  const q = useQuery({ queryKey: ["pick-lists", status], queryFn: () => api<any[]>("/pick-lists", { query: { status } }) });
  return (
    <>
      <PageHeader title="Dispatch" description="Pick lists appear here the moment an order is confirmed. Scan every serial before the truck leaves." />
      <DataTable rowKey={(r: any) => r.id} rows={q.data} loading={q.isLoading} error={q.error} onRetry={q.refetch} onRowClick={(r: any) => nav(`/dispatch/${r.id}`)}
        toolbar={<FilterChips value={status} onChange={setStatus} options={[{ value: "pending,packed", label: "To pack" }, { value: "dispatched", label: "Dispatched" }, { value: "", label: "All" }]} />}
        empty={<EmptyState title="Nothing to pack" description="Confirmed orders create pick lists automatically." icon={<Truck className="h-5 w-5" />} />}
        columns={[
          { key: "o", header: "Order", cell: (r: any) => <span className="font-medium">{r.order.number}</span> },
          { key: "c", header: "Customer", cell: (r: any) => <div>{r.order.customer.name}<span className="block text-sm text-muted">{r.order.customer.city}</span></div> },
          { key: "k", header: "Kit", hideOnMobile: true, cell: (r: any) => r.order.kit.name },
          { key: "p", header: "Packed", cell: (r: any) => (
            <div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-sun" style={{ width: `${(r.scanned / Math.max(r.items, 1)) * 100}%` }} /></div>
              <span className="num text-sm text-muted">{r.scanned}/{r.items}</span></div>) },
          { key: "s", header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
          { key: "d", header: "Created", align: "right", hideOnMobile: true, cell: (r: any) => <span className="text-muted">{relative(r.created_at)}</span> },
        ]} />
    </>
  );
}

export function DispatchScanner() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pick-list", id], queryFn: () => api(`/pick-lists/${id}`) });
  const [serial, setSerial] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string; key: number } | null>(null);
  const [confirm, setConfirm] = useState<null | "dispatch" | "deliver">(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, [q.data?.id]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["pick-list", id] }); qc.invalidateQueries({ queryKey: ["pick-lists"] }); };
  const scan = useAction((s: string) => api(`/pick-lists/${id}/scan`, { body: { serial: s } }), {
    silentError: true,
    onSuccess: (r: any) => { setFeedback({ ok: true, text: `${r.serial}, ${r.product}`, key: Date.now() }); refresh(); if (r.ready) toast.success("Everything is scanned. Ready to dispatch."); },
  });
  const unscan = useAction((s: string) => api(`/pick-lists/${id}/unscan`, { body: { serial: s } }), { onSuccess: refresh });
  const dispatch = useAction(() => api(`/pick-lists/${id}/dispatch`, { body: {} }), { success: "Dispatched. The order is on its way.", onSuccess: () => { refresh(); setConfirm(null); }, invalidate: ["orders"] });
  const deliver = useAction(() => api(`/orders/${q.data.order.id}/deliver`, { body: {} }), { success: "Delivered. Warranty started on every unit.", onSuccess: () => { refresh(); setConfirm(null); }, invalidate: ["orders"] });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const s = serial.trim().toUpperCase();
    if (!s) return;
    setSerial("");
    scan.mutate(s, { onError: (err) => setFeedback({ ok: false, text: (err as ApiError).message, key: Date.now() }) });
    input.current?.focus();
  };

  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error) return <EmptyState tone="bad" title="Couldn't open this pick list" description={(q.error as Error).message} />;
  const pl = q.data;
  const ready = pl.progress.every((r: any) => r.done);
  const wh = can(user, "warehouse");
  return (
    <>
      <PageHeader crumbs={[{ label: "Dispatch", to: "/dispatch" }]} title={`Pick list for ${pl.order.number}`}
        description={`${pl.order.customer.name}, ${pl.order.customer.city}. ${pl.order.kit.name}.`}
        meta={<StatusBadge status={pl.status} />}
        actions={wh && <>
          {pl.status !== "dispatched" && <Button variant="primary" disabled={!ready} title={ready ? undefined : "Scan every serial first"} onClick={() => setConfirm("dispatch")}><Truck className="h-4 w-4" /> Dispatch</Button>}
          {pl.order.status === "dispatched" && <Button variant="primary" onClick={() => setConfirm("deliver")}><CheckCircle2 className="h-4 w-4" /> Mark delivered</Button>}
        </>} />
      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          {pl.status !== "dispatched" && wh && (
            <Card className="p-5">
              <form onSubmit={submit}>
                <label htmlFor="scan" className="flex items-center gap-2 text-base font-medium"><ScanLine className="h-4 w-4" /> Scan a serial</label>
                <p className="mb-3 text-sm text-muted">A barcode scanner types into this box. Press Enter after typing by hand.</p>
                <input id="scan" ref={input} value={serial} onChange={(e) => setSerial(e.target.value)} autoComplete="off" spellCheck={false}
                  className={cn("field h-14 text-lg font-semibold uppercase tracking-wide", feedback && !feedback.ok && "animate-shake border-bad")} placeholder="WAA540-0980001" />
              </form>
              {feedback && (
                <div key={feedback.key} role="status" className={cn("mt-3 flex items-start gap-2 rounded px-3 py-2.5 text-base animate-pop", feedback.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad")}>
                  {feedback.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>{feedback.ok ? `Scanned ${feedback.text}` : feedback.text}</span>
                </div>
              )}
            </Card>
          )}
          <Card>
            <CardHeader title="What to pack" description="Serial-tracked items must be scanned one by one" />
            <ul className="divide-y divide-line">
              {pl.progress.map((r: any) => (
                <li key={r.product_id} className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={cn("grid h-6 w-6 place-items-center rounded-full", r.done ? "bg-ok-soft text-ok" : "bg-sunken text-faint")}><CheckCircle2 className="h-4 w-4" /></span>
                    <span className="flex-1 font-medium">{r.name}</span>
                    <span className={cn("num text-base font-semibold", r.done ? "text-ok" : "text-ink")}>{r.scanned}/{r.qty}</span>
                  </div>
                  {r.is_serialized && <div className="ml-9 mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-sun transition-all" style={{ width: `${(r.scanned / r.qty) * 100}%` }} /></div>}
                  {!r.is_serialized && <p className="ml-9 text-sm text-muted">Counted by quantity, no scan needed</p>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <Card>
          <CardHeader title="Reserved serials" description="These exact units were reserved when the order was confirmed" />
          <ul className="max-h-[560px] divide-y divide-line overflow-y-auto scroll-thin">
            {pl.reserved_units.map((u: any) => (
              <li key={u.serial_no} className="flex items-center gap-3 px-5 py-2">
                <span className={cn("h-2 w-2 rounded-full", u.scanned ? "bg-ok" : "bg-line-strong")} />
                <span className={cn("flex-1 font-medium", !u.scanned && "text-muted")}>{u.serial_no}</span>
                <span className="hidden text-sm text-muted sm:inline">{u.product}</span>
                {wh && pl.status !== "dispatched" && (u.scanned
                  ? <Button size="sm" variant="ghost" aria-label={`Undo ${u.serial_no}`} onClick={() => unscan.mutate(u.serial_no)}><Undo2 className="h-3.5 w-3.5" /></Button>
                  : <Button size="sm" variant="ghost" onClick={() => { setSerial(u.serial_no); input.current?.focus(); }}>Use</Button>)}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <ConfirmDialog open={confirm === "dispatch"} onOpenChange={(o) => !o && setConfirm(null)} title="Dispatch this order?" confirmLabel="Dispatch" loading={dispatch.isPending}
        description="Stock leaves the warehouse and the scanned serials are locked to this customer." onConfirm={() => dispatch.mutate()} />
      <ConfirmDialog open={confirm === "deliver"} onOpenChange={(o) => !o && setConfirm(null)} title="Mark as delivered?" confirmLabel="Mark delivered" loading={deliver.isPending}
        description="The warranty clock starts now for every unit: 2 years for inverters and batteries, 20 years for panels. QR stickers are generated." onConfirm={() => deliver.mutate()} />
    </>
  );
}

export { Textarea };