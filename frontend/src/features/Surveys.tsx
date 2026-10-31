import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { can, useAuth } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { useAction, useList } from "@/lib/hooks";
import { STAGE_LABEL } from "@/lib/status";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, FilterChips } from "@/components/shared/DataTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea, fieldErrors } from "@/components/ui/form";

function SubmitDialog({ survey, onClose }: { survey: any; onClose: () => void }) {
  const [f, setF] = useState({ roof_direction: "S", tilt_deg: "15", cable_distance_m: "15", usable_area_sqft: String(Math.round(survey.requested_kw * 100 + 50)), notes: "" });
  const submit = useAction(() => api(`/surveys/${survey.id}/submit`, { body: {
    roof_direction: f.roof_direction, tilt_deg: Number(f.tilt_deg), cable_distance_m: Number(f.cable_distance_m), usable_area_sqft: Number(f.usable_area_sqft), notes: f.notes || null,
  } }), { success: "Survey report submitted", invalidate: ["surveys"], onSuccess: onClose });
  const errs = fieldErrors(submit.error);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Survey report: ${survey.customer.name}`} description={`${survey.customer.address ?? ""}, ${survey.customer.city ?? ""}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" loading={submit.isPending} onClick={() => submit.mutate()}>Submit report</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Roof faces"><Select value={f.roof_direction} onChange={(e) => setF({ ...f, roof_direction: e.target.value })}>
          {["N", "NE", "E", "SE", "S", "SW", "W", "NW"].map((d) => <option key={d}>{d}</option>)}</Select></Field>
        <Field label="Tilt (degrees)" error={errs.tilt_deg} hint="0 to 90"><Input type="number" min={0} max={90} value={f.tilt_deg} onChange={(e) => setF({ ...f, tilt_deg: e.target.value })} /></Field>
        <Field label="Cable run to meter (m)" error={errs.cable_distance_m}><Input type="number" min={0} value={f.cable_distance_m} onChange={(e) => setF({ ...f, cable_distance_m: e.target.value })} /></Field>
        <Field label="Usable shadow-free area (sq ft)" error={errs.usable_area_sqft}><Input type="number" min={1} value={f.usable_area_sqft} onChange={(e) => setF({ ...f, usable_area_sqft: e.target.value })} /></Field>
        <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Obstructions, water tank, access to roof" /></Field>
      </div>
    </Dialog>
  );
}

export default function Surveys() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [status, setStatus] = useState("scheduled,submitted");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<any>(null);
  const list = useList("surveys", "/surveys", { status, page, page_size: 20 });
  const tech = user?.role === "technician";
  return (
    <>
      <PageHeader title={tech ? "My site surveys" : "Site surveys"} description="Roof direction, tilt and cable distance, recorded on site. Quotes wait for an approved survey." />
      <DataTable rowKey={(r: any) => r.id} rows={list.data?.items} loading={list.isLoading} error={list.error} onRetry={list.refetch}
        page={page} pageSize={20} total={list.data?.total} onPage={setPage}
        onRowClick={tech ? undefined : (r: any) => nav(`/leads/${r.lead_id}`)}
        toolbar={<FilterChips value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[
          { value: "scheduled,submitted", label: "To do" }, { value: "scheduled", label: "Booked" }, { value: "submitted", label: "Awaiting approval" },
          { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} />}
        empty={<EmptyState title="No surveys here" description={tech ? "New survey bookings appear here." : "Book a survey from a qualified lead."} />}
        columns={[
          { key: "c", header: "Customer", cell: (r: any) => <div><span className="font-medium">{r.customer.name}</span><span className="block text-sm text-muted">{r.customer.address}, {r.customer.city}</span></div> },
          { key: "s", header: "System", hideOnMobile: true, cell: (r: any) => `${r.requested_kw} kW ${STAGE_LABEL[r.system_type]?.toLowerCase()}` },
          { key: "t", header: "Technician", hideOnMobile: true, cell: (r: any) => r.technician?.name ?? "—" },
          { key: "w", header: "When", cell: (r: any) => dateTime(r.scheduled_at) },
          { key: "st", header: "Status", cell: (r: any) => <StatusBadge status={r.status} /> },
          { key: "a", header: "", align: "right", cell: (r: any) => can(user, "technician") && ["scheduled", "rejected"].includes(r.status) && (user?.role !== "technician" || r.technician_id === user.id)
            ? <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>Submit report</Button> : null },
        ]} />
      {open && <SubmitDialog survey={open} onClose={() => setOpen(null)} />}
    </>
  );
}
