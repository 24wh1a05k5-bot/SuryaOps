import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeIndianRupee, Printer, Save, Send } from "lucide-react";
import { api } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { date, dateTime, humanize, money } from "@/lib/format";
import { useAction, useDebounced, useList } from "@/lib/hooks";
import { STAGES } from "@/lib/status";
import { uid } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, FilterChips, SearchInput } from "@/components/shared/DataTable";
import { StatusStepper } from "@/components/shared/StatusStepper";
import { EmptyState } from "@/components/shared/EmptyState";
import { BrandMark } from "@/components/shared/Brand";
import { Callout, Card, CardHeader, Skeleton, StatusBadge } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";

export function InvoicesList() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const dq = useDebounced(q);
  useEffect(() => setPage(1), [dq, status]);
  const list = useList("invoices", "/invoices", { q: dq, status, page, page_size: 20 });
  return (
    <>
      <PageHeader title="Invoices" description="Raised automatically when an order is confirmed or a billable repair is resolved." />
      <DataTable rowKey={(r: any) => r.id} rows={list.data?.items} loading={list.isLoading} error={list.error} onRetry={list.refetch}
        page={page} pageSize={20} total={list.data?.total} onPage={setPage} onRowClick={(r: any) => nav(`/invoices/${r.id}`)}
        rowClassName={(r: any) => (r.status === "overdue" ? "bg-bad-soft/40" : undefined)}
        toolbar={<>
          <SearchInput value={q} onChange={setQ} placeholder="Invoice number or customer" />
          <FilterChips value={status} onChange={setStatus} options={[{ value: "", label: "All" }, { value: "sent,partially_paid", label: "Unpaid" }, { value: "overdue", label: "Overdue" }, { value: "paid", label: "Paid" }]} />
        </>}
        columns={[
          { key: "n", header: "Invoice", cell: (r: any) => <div><span className="font-medium">{r.number}</span><span className="block text-sm text-muted">{r.order_id ? "Installation" : "Repair"}</span></div> },
          { key: "c", header: "Customer", cell: (r: any) => r.customer.name },
          { key: "d", header: "Due", hideOnMobile: true, cell: (r: any) => date(r.due_date) },
          { key: "s", header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
          { key: "t", header: "Total", align: "right", cell: (r: any) => <span className="num">{money(r.total)}</span> },
          { key: "b", header: "Balance", align: "right", cell: (r: any) => <span className="num font-medium">{r.balance > 0 ? money(r.balance) : "—"}</span> },
        ]} />
    </>
  );
}

function PaymentDialog({ inv, onClose }: { inv: any; onClose: () => void }) {
  const [amount, setAmount] = useState(String(inv.balance));
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [key] = useState(uid()); // a retry or double click sends the same key, so money is recorded once
  const pay = useAction(() => api(`/invoices/${inv.id}/payments`, { body: { amount: Number(amount), method, reference: reference || null }, idempotent: key }),
    { success: "Payment recorded", invalidate: ["invoice", "invoices", "dashboard"], onSuccess: onClose });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Record payment on ${inv.number}`} description={`Balance due: ${money(inv.balance, true)}. A payment can't be more than the balance.`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={pay.isPending} onClick={() => pay.mutate()}>Record payment</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (₹)"><Input type="number" value={amount} max={inv.balance} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option><option value="card">Card</option></Select></Field>
        <Field label="Reference" className="sm:col-span-2"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR or cheque number" /></Field>
      </div>
    </Dialog>
  );
}

export function InvoiceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["invoice", id], queryFn: () => api(`/invoices/${id}`) });
  const [paying, setPaying] = useState(false);
  const send = useAction(() => api(`/invoices/${id}/send`, { body: {} }), { success: "Invoice sent", invalidate: ["invoice", "invoices"] });
  if (q.isLoading) return <Skeleton className="h-96" />;
  if (q.error) return <EmptyState tone="bad" title="Couldn't open this invoice" description={(q.error as Error).message} />;
  const inv = q.data;
  const acc = can(user, "accounts");
  return (
    <>
      <PageHeader crumbs={[{ label: "Invoices", to: "/invoices" }]} title={inv.number} meta={<StatusBadge status={inv.status} />}
        actions={<>
          {acc && inv.status === "draft" && <Button loading={send.isPending} onClick={() => send.mutate()}><Send className="h-4 w-4" /> Send</Button>}
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Print or save PDF</Button>
          {acc && inv.balance > 0 && <Button variant="primary" onClick={() => setPaying(true)}><BadgeIndianRupee className="h-4 w-4" /> Record payment</Button>}
        </>} />
      <div className="no-print mb-6"><StatusStepper stages={STAGES.invoice} current={inv.status === "overdue" ? "partially_paid" : inv.status} /></div>
      {inv.status === "overdue" && <div className="no-print mb-4"><Callout tone="bad" title={`Overdue since ${date(inv.due_date)}`}>{money(inv.balance)} is still outstanding.</Callout></div>}
      <Card className="mx-auto max-w-3xl p-8 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div className="flex items-center gap-3"><BrandMark className="h-10 w-10" /><div><p className="text-lg font-semibold">{inv.company}</p><p className="text-sm text-muted">Rooftop solar installation and service</p></div></div>
          <div className="text-right"><p className="text-xl font-semibold">Tax invoice</p><p className="text-muted">{inv.number}</p></div>
        </div>
        <div className="grid gap-6 py-6 sm:grid-cols-3">
          <div><p className="text-sm text-muted">Billed to</p><p className="font-medium">{inv.customer.name}</p><p className="text-sm text-muted">{inv.customer.address}, {inv.customer.city}</p><p className="text-sm text-muted">{inv.customer.phone}</p></div>
          <div><p className="text-sm text-muted">Issued</p><p className="font-medium">{date(inv.issued_at)}</p><p className="mt-2 text-sm text-muted">Due</p><p className="font-medium">{date(inv.due_date)}</p></div>
          <div className="sm:text-right"><p className="text-sm text-muted">Balance due</p><p className="num text-2xl font-semibold">{money(inv.balance, true)}</p></div>
        </div>
        <table className="w-full">
          <thead><tr className="border-y border-line text-left text-sm text-muted"><th className="py-2 font-medium">Description</th><th className="py-2 text-right font-medium">Qty</th><th className="py-2 text-right font-medium">Rate</th><th className="py-2 text-right font-medium">Amount</th></tr></thead>
          <tbody>{inv.lines.map((l: any) => (
            <tr key={l.id} className="border-b border-line"><td className="py-2.5">{l.description}</td><td className="num py-2.5 text-right">{l.qty}</td><td className="num py-2.5 text-right text-muted">{money(l.unit_price, true)}</td><td className="num py-2.5 text-right">{money(l.line_total, true)}</td></tr>))}</tbody>
          <tfoot>
            {inv.tax > 0 && <tr><td colSpan={3} className="pt-3 text-right text-muted">Tax</td><td className="num pt-3 text-right">{money(inv.tax, true)}</td></tr>}
            <tr><td colSpan={3} className="pt-3 text-right font-semibold">Total</td><td className="num pt-3 text-right font-semibold">{money(inv.total, true)}</td></tr>
            <tr><td colSpan={3} className="pt-1 text-right text-muted">Paid</td><td className="num pt-1 text-right text-muted">{money(inv.amount_paid, true)}</td></tr>
          </tfoot>
        </table>
        {inv.payments.length > 0 && (
          <div className="mt-8">
            <p className="mb-2 text-sm font-medium">Payments received</p>
            <ul className="divide-y divide-line rounded-md border border-line text-base">
              {inv.payments.map((p: any) => <li key={p.id} className="flex justify-between gap-4 px-4 py-2"><span>{dateTime(p.paid_at)}<span className="block text-sm text-muted">{humanize(p.method)}{p.reference ? `, ${p.reference}` : ""}</span></span><span className="num font-medium">{money(p.amount, true)}</span></li>)}
            </ul>
          </div>
        )}
        {inv.order_id && <p className="mt-6 text-sm text-muted">Any PM Surya Ghar subsidy is paid by the government directly to the customer's bank account after DISCOM inspection and net metering.</p>}
      </Card>
      {paying && <PaymentDialog inv={inv} onClose={() => setPaying(false)} />}
    </>
  );
}

export function TechnicianPay() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const q = useQuery({ queryKey: ["tech-pay", month], queryFn: () => api("/technicians/pay", { query: { month } }) });
  const [confirm, setConfirm] = useState<any>(null);
  const pay = useAction((r: any) => api(`/technicians/${r.technician.id}/pay-runs`, { body: { month } }), { success: "Marked as paid", invalidate: ["tech-pay", "dashboard"], onSuccess: () => setConfirm(null) });
  const rows = q.data?.rows ?? [];
  const due = rows.filter((r: any) => !r.paid).reduce((s: number, r: any) => s + r.amount, 0);
  return (
    <>
      <PageHeader title="Technician pay" description="Hours come straight from survey, installation and repair times. A month can only be paid once."
        actions={<Input type="month" className="w-44" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(e) => setMonth(e.target.value)} aria-label="Month" />} />
      <DataTable rowKey={(r: any) => r.technician.id} rows={rows} loading={q.isLoading} error={q.error}
        toolbar={<p className="text-base">Still to pay for {new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}: <span className="num font-semibold">{money(due)}</span></p>}
        columns={[
          { key: "n", header: "Technician", cell: (r: any) => <span className="font-medium">{r.technician.name}</span> },
          { key: "t", header: "Tasks", align: "right", cell: (r: any) => <span className="num">{r.tasks}</span> },
          { key: "h", header: "Hours", align: "right", cell: (r: any) => <span className="num">{r.hours}</span> },
          { key: "r", header: "Rate", align: "right", hideOnMobile: true, cell: (r: any) => <span className="num text-muted">{money(r.hourly_rate)}/h</span> },
          { key: "a", header: "Amount", align: "right", cell: (r: any) => <span className="num font-semibold">{money(r.paid ? r.paid_amount : r.amount)}</span> },
          { key: "p", header: "", align: "right", cell: (r: any) => r.paid ? <span className="text-sm text-ok">Paid {date(r.paid_at)}</span>
            : <Button size="sm" variant="primary" disabled={r.hours <= 0} onClick={() => setConfirm(r)}>Mark as paid</Button> },
        ]} />
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title={`Pay ${confirm?.technician.name}?`} confirmLabel="Mark as paid" loading={pay.isPending}
        description={confirm ? `${confirm.hours} hours at ${money(confirm.hourly_rate)} per hour comes to ${money(confirm.amount)}. This can't be undone.` : ""} onConfirm={() => pay.mutate(confirm)} />
    </>
  );
}

export function Settings() {
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api("/settings") });
  const [f, setF] = useState<any>(null);
  useEffect(() => { if (q.data) setF(q.data); }, [q.data]);
  const save = useAction(() => api("/settings", { method: "PATCH", body: { values: {
    ...f, tariff_per_unit: Number(f.tariff_per_unit), gen_per_kw_per_day: Number(f.gen_per_kw_per_day), ticket_sla_days: Number(f.ticket_sla_days),
    subsidy_stage_sla_days: Number(f.subsidy_stage_sla_days), invoice_due_days: Number(f.invoice_due_days), default_labour_rate: Number(f.default_labour_rate),
    min_advance_percent: Number(f.min_advance_percent), gst_percent: Number(f.gst_percent),
    subsidy_rates: { first_2kw_per_kw: Number(f.subsidy_rates.first_2kw_per_kw), third_kw: Number(f.subsidy_rates.third_kw), cap: Number(f.subsidy_rates.cap) },
  } } }), { success: "Settings saved", invalidate: ["settings", "dashboard"] });
  if (!f) return <Skeleton className="h-96" />;
  const num = (k: string, label: string, hint?: string) => <Field label={label} hint={hint}><Input type="number" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  const rate = (k: string, label: string) => <Field label={label}><Input type="number" value={f.subsidy_rates[k]} onChange={(e) => setF({ ...f, subsidy_rates: { ...f.subsidy_rates, [k]: e.target.value } })} /></Field>;
  return (
    <>
      <PageHeader title="Settings" description="Rates and deadlines used across quotes, the subsidy tracker and the dashboard."
        actions={<Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}><Save className="h-4 w-4" /> Save settings</Button>} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card><CardHeader title="Company" /><div className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label="Company name" className="sm:col-span-2"><Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></Field>
          {num("min_advance_percent", "Minimum advance (%)", "Needed to confirm an order")}{num("invoice_due_days", "Invoice due after (days)")}
          {num("gst_percent", "GST on orders (%)")}{num("default_labour_rate", "Repair labour rate (₹/hour)")}
        </div></Card>
        <Card><CardHeader title="PM Surya Ghar subsidy" description="Government schemes change. Update these when they do." /><div className="grid gap-4 p-5 sm:grid-cols-3">
          {rate("first_2kw_per_kw", "Per kW, first 2 kW (₹)")}{rate("third_kw", "For the 3rd kW (₹)")}{rate("cap", "Maximum (₹)")}
          {num("subsidy_stage_sla_days", "Flag a stage after (days)")}
        </div></Card>
        <Card><CardHeader title="Savings estimate" description="Used for the payback card on quotes" /><div className="grid gap-4 p-5 sm:grid-cols-2">
          {num("gen_per_kw_per_day", "Units generated per kW per day")}{num("tariff_per_unit", "Electricity tariff (₹/unit)")}
        </div></Card>
        <Card><CardHeader title="Service" /><div className="grid gap-4 p-5 sm:grid-cols-2">{num("ticket_sla_days", "Repair deadline (days)", "MNRE expects 15")}</div></Card>
      </div>
    </>
  );
}
