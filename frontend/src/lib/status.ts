/** One source of truth for every status colour in the system. */
export type Tone = "neutral" | "sun" | "cell" | "ok" | "warn" | "bad" | "info";

const MAP: Record<string, Tone> = {
  // leads
  new: "info", contacted: "cell", qualified: "cell", survey_scheduled: "sun", survey_approved: "sun", quoted: "sun", won: "ok", lost: "neutral",
  // surveys
  scheduled: "cell", submitted: "sun", approved: "ok", rejected: "bad",
  // orders
  draft: "neutral", sent: "info", confirmed: "cell", dispatched: "sun", delivered: "sun", installed: "ok", completed: "ok", cancelled: "neutral",
  // purchases / stock
  ordered: "info", received: "ok", in_stock: "ok", reserved: "cell", returned: "neutral", scrapped: "bad",
  pending: "neutral", packed: "sun",
  // jobs
  unscheduled: "warn", in_progress: "sun", customer_accepted: "ok",
  // subsidy
  applied: "info", feasibility_approved: "cell", inspection_submitted: "sun", net_meter_installed: "cell", subsidy_credited: "ok",
  // tickets
  open: "warn", assigned: "cell", resolved: "ok", closed: "neutral",
  // invoices
  partially_paid: "sun", paid: "ok", overdue: "bad",
};

export const toneFor = (status?: string | null): Tone => (status ? MAP[status] ?? "neutral" : "neutral");

export const STAGES = {
  lead: ["new", "contacted", "qualified", "survey_scheduled", "survey_approved", "quoted", "won"],
  order: ["draft", "sent", "confirmed", "dispatched", "delivered", "completed"],
  job: ["unscheduled", "scheduled", "in_progress", "customer_accepted"],
  subsidy: ["applied", "feasibility_approved", "installed", "inspection_submitted", "net_meter_installed", "subsidy_credited"],
  ticket: ["open", "assigned", "in_progress", "resolved", "closed"],
  invoice: ["draft", "sent", "partially_paid", "paid"],
  purchase: ["draft", "ordered", "received"],
};

export const STAGE_LABEL: Record<string, string> = {
  survey_scheduled: "Survey booked", survey_approved: "Survey approved", in_progress: "In progress",
  customer_accepted: "Signed off", feasibility_approved: "Feasibility OK", inspection_submitted: "Inspection",
  net_meter_installed: "Net meter", subsidy_credited: "Subsidy credited", partially_paid: "Part paid",
  in_stock: "In stock", on_grid: "On-grid", off_grid: "Off-grid", panel_set: "Panel set",
};
