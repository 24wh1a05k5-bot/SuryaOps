import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Copy, Download, Link2, Printer, Share2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api, downloadCsv } from "@/lib/api";
import { compactMoney, date, humanize, isoDate, money, number } from "@/lib/format";
import { useAction } from "@/lib/hooks";
import { useChartColors } from "@/lib/chart";
import { STAGE_LABEL } from "@/lib/status";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { Kpi, KpiStrip } from "@/components/shared/Kpi";
import { DataTable, FilterChips } from "@/components/shared/DataTable";
import { Badge, Card, CardHeader, Skeleton, StatusBadge } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { EmptyState } from "@/components/shared/EmptyState";

type Range = "today" | "week" | "month" | "90d" | "custom";

export function rangeFor(r: Range, custom: { from: string; to: string }) {
  const today = new Date();
  const start = new Date(today);
  if (r === "today") return { from: isoDate(today), to: isoDate(today) };
  if (r === "week") { start.setDate(today.getDate() - ((today.getDay() + 6) % 7)); return { from: isoDate(start), to: isoDate(today) }; }
  if (r === "month") return { from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: isoDate(today) };
  if (r === "90d") { start.setDate(today.getDate() - 89); return { from: isoDate(start), to: isoDate(today) }; }
  return custom;
}

export function TrendChart({ data }: { data: any[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.revenue} stopOpacity={0.18} /><stop offset="100%" stopColor={c.revenue} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={c.grid} vertical={false} />
        <XAxis dataKey="period" tickFormatter={(v) => new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tickFormatter={(v) => compactMoney(v).replace(".00", "")} tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} width={64} />
        <Tooltip cursor={{ stroke: c.axis, strokeDasharray: "3 3" }}
          content={({ active, payload, label }) => active && payload?.length ? (
            <div className="rounded-md bg-raised px-3 py-2 text-sm shadow-pop">
              <p className="mb-1 font-medium">Week of {date(String(label))}</p>
              {payload.map((p) => (
                <p key={p.dataKey as string} className="flex items-center gap-2 text-muted">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                  {p.dataKey === "revenue" ? "Revenue" : "Cost"} <span className="num ml-auto pl-4 font-medium text-ink">{money(p.value as number)}</span>
                </p>
              ))}
            </div>) : null} />
        <Area type="monotone" dataKey="revenue" stroke={c.revenue} strokeWidth={2} fill="url(#rev)" dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} />
        <Area type="monotone" dataKey="cost" stroke={c.cost} strokeWidth={2} fill="transparent" dot={false} activeDot={{ r: 4, stroke: c.surface, strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StageBars({ data }: { data: { stage: string; count: number }[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 0, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid stroke={c.grid} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: c.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="stage" width={88} tickFormatter={(s) => STAGE_LABEL[s] ?? humanize(s)} tick={{ fill: c.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
        <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }}
          content={({ active, payload }) => active && payload?.length ? (
            <div className="rounded-md bg-raised px-3 py-2 text-sm shadow-pop">
              {humanize(String(payload[0].payload.stage))}: <span className="num font-medium">{String(payload[0].value)}</span> orders
            </div>) : null} />
        <Bar dataKey="count" fill={c.bar} radius={[0, 4, 4, 0]} label={{ position: "right", fill: c.muted, fontSize: 12 }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function ShareDialog({ open, onOpenChange, period }: { open: boolean; onOpenChange: (o: boolean) => void; period: { from: string; to: string } }) {
  const [title, setTitle] = useState("Business report");
  const [days, setDays] = useState("7");
  const links = useQuery({ queryKey: ["shared-reports"], queryFn: () => api<any[]>("/shared-reports"), enabled: open });
  const create = useAction(() => api("/shared-reports", { body: { title, period_start: period.from, period_end: period.to, expires_in_days: Number(days) } }),
    { success: "Share link created", invalidate: ["shared-reports"], onSuccess: (r: any) => copy(shareUrl(r.token)) });
  const revoke = useAction((id: number) => api(`/shared-reports/${id}`, { method: "DELETE" }), { success: "Link revoked", invalidate: ["shared-reports"] });
  const shareUrl = (token: string) => `${location.origin}/shared/${token}`;
  const copy = (url: string) => { navigator.clipboard?.writeText(url).then(() => toast.success("Link copied")).catch(() => undefined); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} wide title="Share a read-only report"
      description={`Anyone with the link sees the numbers for ${date(period.from)} to ${date(period.to)}. Customer names are shortened and no phone numbers or addresses are included.`}>
      <div className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
        <Field label="Report title"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Link expires after">
          <Select value={days} onChange={(e) => setDays(e.target.value)}>
            {["1", "7", "14", "30", "90"].map((d) => <option key={d} value={d}>{d} day{d === "1" ? "" : "s"}</option>)}
          </Select>
        </Field>
        <Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}><Link2 className="h-4 w-4" /> Create link</Button>
      </div>
      <div className="mt-6">
        <p className="mb-2 text-sm font-medium">Existing links</p>
        {links.isLoading ? <Skeleton className="h-16" /> : !links.data?.length ? <p className="text-sm text-muted">No links shared yet.</p> : (
          <ul className="divide-y divide-line rounded-md border border-line">
            {links.data.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.title}</p>
                  <p className="text-sm text-muted">{date(l.period_start)} to {date(l.period_end)}. {l.views} view{l.views === 1 ? "" : "s"}. {l.active ? `Expires ${date(l.expires_at)}` : l.revoked ? "Revoked" : "Expired"}</p>
                </div>
                {l.active && <>
                  <Button size="sm" onClick={() => copy(shareUrl(l.token))}><Copy className="h-3.5 w-3.5" /> Copy</Button>
                  <Button size="sm" variant="ghost" onClick={() => window.open(shareUrl(l.token), "_blank")}>Open</Button>
                  <Button size="sm" variant="ghost" className="text-bad" onClick={() => revoke.mutate(l.id)}>Revoke</Button>
                </>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  );
}

export function DashboardBody({ d, publicView }: { d: any; publicView?: boolean }) {
  const nav = useNavigate();
  const k = d.kpis;
  return (
    <div className="space-y-6">
      <KpiStrip>
        <Kpi label="Revenue" value={compactMoney(k.revenue)} note={`${k.jobs_confirmed} job${k.jobs_confirmed === 1 ? "" : "s"} confirmed`} />
        <Kpi label="Costs" value={compactMoney(k.costs)} note="Parts, labour and repairs" />
        <Kpi label="Profit" value={compactMoney(k.profit)} tone={k.profit < 0 ? "bad" : "ok"} note={`${k.margin_pct}% margin`} emphasis />
        <Kpi label="Money blocked by subsidy delays" value={compactMoney(k.subsidy_blocked)} tone={k.subsidy_blocked > 0 ? "warn" : undefined} note="Unpaid on jobs waiting for net metering" />
        <Kpi label="Open installations" value={number(k.open_jobs)} note="Unscheduled, scheduled or in progress" />
        <Kpi label="Open repairs" value={number(k.open_tickets)} tone={k.overdue_tickets ? "bad" : undefined} note={k.overdue_tickets ? `${k.overdue_tickets} past the 15-day deadline` : "All within 15 days"} />
        <Kpi label="Outstanding invoices" value={compactMoney(k.outstanding)} note={`${k.overdue_invoices} overdue`} tone={k.overdue_invoices ? "warn" : undefined} />
        <Kpi label="Loss-making jobs" value={number(k.loss_making_jobs)} tone={k.loss_making_jobs ? "bad" : "ok"} note={k.loss_making_jobs ? "Review pricing on these" : "Every job made money"} />
      </KpiStrip>

      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Revenue and cost" description="Confirmed jobs, by week"
            actions={<div className="flex items-center gap-4 text-sm text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-1)" }} /> Revenue</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-2)" }} /> Cost</span>
            </div>} />
          <div className="px-3 py-4">{d.trend.some((t: any) => t.revenue) ? <TrendChart data={d.trend} /> : <EmptyState title="No confirmed jobs in this period" description="Pick a longer period to see the trend." />}</div>
        </Card>
        <Card>
          <CardHeader title="Orders by stage" description="Every open and finished order" />
          <div className="px-3 py-4"><StageBars data={d.jobs_by_stage} /></div>
        </Card>
      </div>

      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-md font-semibold">Profit per job</h2>
            <p className="text-sm text-muted">Invoice total minus the exact cost of every serial used, other parts, technician hours and warranty repairs.</p>
          </div>
        </div>
        <DataTable rowKey={(r: any) => r.order_id} rows={d.profit_per_job} dense
          onRowClick={publicView ? undefined : (r: any) => nav(`/orders/${r.order_id}`)}
          rowClassName={(r: any) => (r.profit < 0 ? "bg-bad-soft/60 hover:bg-bad-soft" : undefined)}
          empty={<EmptyState title="No jobs confirmed in this period" />}
          columns={[
            { key: "n", header: "Order", cell: (r: any) => <span className="font-medium">{r.number}</span> },
            { key: "c", header: "Customer", cell: (r: any) => <span>{r.customer}<span className="block text-sm text-muted">{r.city}</span></span> },
            { key: "k", header: "System", hideOnMobile: true, cell: (r: any) => r.kit },
            { key: "s", header: "Status", hideOnMobile: true, cell: (r: any) => <StatusBadge status={r.status} /> },
            { key: "r", header: "Revenue", align: "right", cell: (r: any) => <span className="num">{money(r.revenue)}</span> },
            { key: "p", header: "Parts", align: "right", hideOnMobile: true, cell: (r: any) => <span className="num text-muted">{money(r.parts_cost)}</span> },
            { key: "l", header: "Labour", align: "right", hideOnMobile: true, cell: (r: any) => <span className="num text-muted">{money(r.labour_cost)}</span> },
            { key: "w", header: "Repairs", align: "right", hideOnMobile: true, cell: (r: any) => <span className="num text-muted">{r.warranty_cost ? money(r.warranty_cost) : "—"}</span> },
            { key: "pr", header: "Profit", align: "right", cell: (r: any) => (
              <span className={cn("num font-semibold", r.profit < 0 ? "text-bad" : "text-ok")}>
                {r.profit < 0 && <TriangleAlert className="mr-1 inline h-3.5 w-3.5" aria-label="Loss" />}{money(r.profit)}
                <span className="block text-sm font-normal text-muted">{r.margin_pct}%</span>
              </span>) },
          ]} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Subsidy paperwork" description="PM Surya Ghar cases by stage" actions={!publicView && <Link to="/subsidy" className="text-sm font-medium text-cell hover:underline">Open tracker</Link>} />
          <ul className="divide-y divide-line">
            {d.subsidy_by_stage.map((s: any) => (
              <li key={s.stage} className="flex items-center gap-3 px-5 py-2.5">
                <span className="flex-1">{STAGE_LABEL[s.stage] ?? humanize(s.stage)}</span>
                {s.overdue > 0 && <Badge tone="bad">{s.overdue} overdue</Badge>}
                <span className="num w-16 text-right text-sm text-muted">{s.count ? `${s.avg_days}d avg` : ""}</span>
                <span className="num w-6 text-right font-semibold">{s.count}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Repairs closest to deadline" description="MNRE expects fixes within 15 days" />
          {d.open_tickets.length ? (
            <ul className="divide-y divide-line">
              {d.open_tickets.map((t: any) => (
                <li key={t.id}>
                  <button disabled={publicView} onClick={() => nav(`/tickets/${t.id}`)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left enabled:hover:bg-sunken/60">
                    <span className="min-w-0 flex-1"><span className="block font-medium">{t.number}</span><span className="block truncate text-sm text-muted">{t.customer}</span></span>
                    <Badge tone={t.days_left < 0 ? "bad" : t.days_left < 4 ? "warn" : "neutral"}>{t.days_left < 0 ? `${Math.abs(Math.round(t.days_left))}d late` : `${Math.round(t.days_left)}d left`}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="No open repairs" />}
        </Card>
        <Card>
          <CardHeader title="Invoices waiting for payment" description="Oldest due date first" />
          {d.invoices_outstanding.length ? (
            <ul className="divide-y divide-line">
              {d.invoices_outstanding.map((i: any) => (
                <li key={i.id}>
                  <button disabled={publicView} onClick={() => nav(`/invoices/${i.id}`)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left enabled:hover:bg-sunken/60">
                    <span className="min-w-0 flex-1"><span className="block font-medium">{i.number}</span><span className="block truncate text-sm text-muted">{i.customer}. Due {date(i.due_date)}</span></span>
                    <span className="num text-right font-medium">{money(i.balance)}{i.status === "overdue" && <span className="block text-sm font-normal text-bad">Overdue</span>}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Every invoice is paid" />}
        </Card>
      </div>

      {!publicView && d.technician_pay_due?.some((r: any) => r.amount > 0) && (
        <Card>
          <CardHeader title="Technician pay due this month" description="Logged hours on surveys, installations and repairs" actions={<Link to="/technician-pay" className="text-sm font-medium text-cell hover:underline">Pay technicians</Link>} />
          <div className="grid divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
            {d.technician_pay_due.filter((r: any) => r.amount > 0).map((r: any) => (
              <div key={r.technician.id} className="px-5 py-3">
                <p className="font-medium">{r.technician.name}</p>
                <p className="num text-sm text-muted">{r.hours} h at {money(r.hourly_rate)}/h</p>
                <p className="num mt-1 text-lg font-semibold">{money(r.amount)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

const REPORTS = [
  ["profit_per_job", "Profit per job"], ["invoices", "Invoices"], ["tickets", "Service tickets"],
  ["technician_pay", "Technician pay"], ["subsidy", "Subsidy cases"],
];

export default function Dashboard() {
  const [range, setRange] = useState<Range>("90d");
  const [custom, setCustom] = useState(() => rangeFor("month", { from: "", to: "" }));
  const period = useMemo(() => rangeFor(range, custom), [range, custom]);
  const [share, setShare] = useState(false);
  const q = useQuery({ queryKey: ["dashboard", period], queryFn: () => api("/dashboard", { query: { d_from: period.from, d_to: period.to } }), placeholderData: (p) => p });

  return (
    <>
      <PageHeader title="Business overview" description={`${date(period.from)} to ${date(period.to)}`}
        actions={<>
          <Menu>
            <MenuTrigger asChild><Button><Download className="h-4 w-4" /> Export CSV</Button></MenuTrigger>
            <MenuContent>
              {REPORTS.map(([key, label]) => (
                <MenuItem key={key} onSelect={() => downloadCsv(`/reports/${key}.csv`, { d_from: period.from, d_to: period.to }, `${key}_${period.from}_${period.to}.csv`)
                  .then(() => toast.success(`${label} exported`)).catch((e) => toast.error(e.message))}>{label}</MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <Button onClick={() => window.open(`/reports/print?from=${period.from}&to=${period.to}`, "_blank")}><Printer className="h-4 w-4" /> Print report</Button>
          <Button variant="primary" onClick={() => setShare(true)}><Share2 className="h-4 w-4" /> Share report</Button>
        </>} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <FilterChips value={range} onChange={setRange} options={[
          { value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "This month" },
          { value: "90d", label: "Last 90 days" }, { value: "custom", label: "Custom" }]} />
        {range === "custom" && (
          <div className="flex items-center gap-2">
            <Input type="date" className="w-40" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} aria-label="From" />
            <span className="text-muted">to</span>
            <Input type="date" className="w-40" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} aria-label="To" />
          </div>
        )}
      </div>
      {q.isLoading ? (
        <div className="space-y-6"><Skeleton className="h-48" /><div className="grid gap-6 xl:grid-cols-[2fr_1fr]"><Skeleton className="h-80" /><Skeleton className="h-80" /></div><Skeleton className="h-72" /></div>
      ) : q.error ? (
        <EmptyState tone="bad" title="The dashboard didn't load" description={(q.error as Error).message} action={<Button onClick={() => q.refetch()}>Try again</Button>} />
      ) : (
        <div className={cn("transition-opacity", q.isFetching && "opacity-70")}><DashboardBody d={q.data} /></div>
      )}
      <ShareDialog open={share} onOpenChange={setShare} period={period} />
    </>
  );
}
