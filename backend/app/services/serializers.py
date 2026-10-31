"""Turn ORM objects into JSON-ready dicts (one place, consistent shapes)."""
from datetime import date, timedelta

from app.models import (Customer, Invoice, Job, Lead, Order, Payment, Photo, Product, Purchase, StockUnit,
                        SubsidyCase, Survey, Ticket, User)
from app.services.common import now


def f(v):
    """Decimal -> float for JSON (money is stored exactly in the DB)."""
    return float(v) if v is not None else None


def user_brief(u: User | None):
    return {"id": u.id, "name": u.name, "role": u.role} if u else None


def user_out(u: User):
    return {"id": u.id, "name": u.name, "email": u.email, "role": u.role, "phone": u.phone,
            "hourly_rate": f(u.hourly_rate), "is_active": u.is_active}


def customer_out(c: Customer):
    return {"id": c.id, "name": c.name, "phone": c.phone, "email": c.email, "address": c.address,
            "city": c.city, "pincode": c.pincode, "consumer_no": c.consumer_no,
            "aadhaar_name": c.aadhaar_name, "bill_name": c.bill_name,
            "bank_account_name": c.bank_account_name, "bank_aadhaar_seeded": c.bank_aadhaar_seeded,
            "monthly_bill": f(c.monthly_bill), "created_at": c.created_at}


def survey_out(s: Survey):
    return {"id": s.id, "lead_id": s.lead_id, "technician_id": s.technician_id, "scheduled_at": s.scheduled_at,
            "roof_direction": s.roof_direction, "tilt_deg": f(s.tilt_deg),
            "cable_distance_m": f(s.cable_distance_m), "usable_area_sqft": f(s.usable_area_sqft),
            "notes": s.notes, "status": s.status, "submitted_at": s.submitted_at,
            "reviewed_at": s.reviewed_at, "rejection_reason": s.rejection_reason, "version": s.version}


def lead_out(lead: Lead, detail: bool = False):
    going_cold = (lead.status in ("new", "contacted") and lead.last_activity_at is not None
                  and now() - lead.last_activity_at > timedelta(hours=48))
    data = {"id": lead.id, "customer": customer_out(lead.customer), "source": lead.source,
            "requested_kw": f(lead.requested_kw), "system_type": lead.system_type,
            "wants_subsidy": lead.wants_subsidy, "roof_area_sqft": f(lead.roof_area_sqft),
            "shadow_free": lead.shadow_free, "grid_suitable": lead.grid_suitable, "status": lead.status,
            "lost_reason": lead.lost_reason, "assigned_to": lead.assigned_to, "going_cold": going_cold,
            "created_at": lead.created_at, "version": lead.version}
    if detail:
        data["surveys"] = [survey_out(s) for s in lead.surveys]
    return data


def product_out(p: Product):
    return {"id": p.id, "sku": p.sku, "name": p.name, "category": p.category, "brand": p.brand,
            "model": p.model, "wattage": p.wattage, "unit": p.unit, "cost_price": f(p.cost_price),
            "sale_price": f(p.sale_price), "warranty_months": p.warranty_months,
            "is_serialized": p.is_serialized, "is_dcr": p.is_dcr, "is_active": p.is_active,
            "qty_on_hand": p.qty_on_hand, "qty_reserved": p.qty_reserved, "reorder_level": p.reorder_level}


def unit_out(u: StockUnit):
    today = date.today()
    return {"id": u.id, "serial_no": u.serial_no, "status": u.status, "product": product_out(u.product),
            "order_id": u.order_id, "customer_id": u.customer_id, "unit_cost": f(u.unit_cost),
            "scanned_at": u.scanned_at, "dispatched_at": u.dispatched_at, "delivered_at": u.delivered_at,
            "warranty_end": u.warranty_end, "qr_token": u.qr_token,
            "in_warranty": bool(u.warranty_end and today <= u.warranty_end)}


def order_out(o: Order, detail: bool = False):
    data = {"id": o.id, "number": o.number, "lead_id": o.lead_id, "customer": customer_out(o.customer),
            "kit": {"id": o.kit.id, "name": o.kit.name}, "capacity_kw": f(o.capacity_kw),
            "includes_installation": o.includes_installation, "is_subsidy": o.is_subsidy,
            "sanctioned_kw": f(o.sanctioned_kw), "expected_subsidy": f(o.expected_subsidy),
            "subtotal": f(o.subtotal), "tax": f(o.tax), "total": f(o.total), "status": o.status,
            "confirmed_at": o.confirmed_at, "completed_at": o.completed_at, "created_at": o.created_at,
            "version": o.version}
    if detail:
        data["lines"] = [{"id": ln.id, "product": product_out(ln.product), "qty": ln.qty,
                          "unit_price": f(ln.unit_price), "line_total": f(ln.line_total)} for ln in o.lines]
    return data


def purchase_out(p: Purchase, detail: bool = False):
    data = {"id": p.id, "number": p.number, "supplier": {"id": p.supplier.id, "name": p.supplier.name},
            "status": p.status, "ordered_at": p.ordered_at, "received_at": p.received_at,
            "total": f(p.total), "created_at": p.created_at, "version": p.version}
    if detail:
        data["lines"] = [{"id": ln.id, "product": product_out(ln.product), "qty": ln.qty,
                          "unit_cost": f(ln.unit_cost)} for ln in p.lines]
    return data


def photo_out(p: Photo):
    return {"id": p.id, "kind": p.kind, "url": f"/uploads/{p.path}", "lat": f(p.lat), "lng": f(p.lng),
            "taken_at": p.taken_at, "has_gps": p.lat is not None and p.lng is not None}


def job_out(j: Job, technician: User | None = None):
    return {"id": j.id, "order": order_out(j.order), "technician_id": j.technician_id,
            "technician": user_brief(technician), "scheduled_start": j.scheduled_start,
            "scheduled_end": j.scheduled_end, "actual_start": j.actual_start, "actual_end": j.actual_end,
            "installed_kw": f(j.installed_kw), "status": j.status, "signed_by_name": j.signed_by_name,
            "signature_url": f"/uploads/{j.signature_path}" if j.signature_path else None,
            "accepted_at": j.accepted_at, "notes": j.notes, "version": j.version}


def subsidy_out(c: SubsidyCase, sla_days: int):
    days = (now() - c.stage_entered_at).days
    return {"id": c.id, "order": order_out(c.order), "application_no": c.application_no, "stage": c.stage,
            "stage_entered_at": c.stage_entered_at, "days_in_stage": days,
            "overdue": c.stage != "subsidy_credited" and days > sla_days,
            "feasibility_approved_at": c.feasibility_approved_at,
            "inspection_submitted_at": c.inspection_submitted_at, "net_meter_at": c.net_meter_at,
            "subsidy_credited_at": c.subsidy_credited_at, "version": c.version}


def ticket_out(t: Ticket, detail: bool = False):
    remaining = (t.due_by - now()).total_seconds() / 86400
    data = {"id": t.id, "number": t.number, "customer": customer_out(t.customer),
            "unit": unit_out(t.unit) if t.unit else None, "channel": t.channel, "issue": t.issue,
            "fault_code": t.fault_code, "in_warranty": t.in_warranty, "assigned_to": t.assigned_to,
            "status": t.status, "due_by": t.due_by, "days_left": round(remaining, 1),
            "overdue": t.status not in ("resolved", "closed") and remaining < 0,
            "resolved_at": t.resolved_at, "customer_confirmed_at": t.customer_confirmed_at,
            "created_at": t.created_at, "version": t.version}
    if detail:
        data["lines"] = [{"id": ln.id, "is_labour": ln.is_labour, "description": ln.description,
                          "qty": f(ln.qty), "unit_price": f(ln.unit_price), "unit_cost": f(ln.unit_cost),
                          "line_total": f(ln.line_total)} for ln in t.lines]
        data["customer_total"] = 0.0 if t.in_warranty else sum(f(ln.line_total) for ln in t.lines)
        data["company_cost"] = sum(f(ln.unit_cost) * f(ln.qty) for ln in t.lines)
    return data


def payment_out(p: Payment):
    return {"id": p.id, "amount": f(p.amount), "method": p.method, "reference": p.reference,
            "paid_at": p.paid_at}


def invoice_status(inv: Invoice) -> str:
    if inv.status in ("sent", "partially_paid") and inv.due_date < date.today():
        return "overdue"
    return inv.status


def invoice_out(inv: Invoice, detail: bool = False):
    data = {"id": inv.id, "number": inv.number, "customer": customer_out(inv.customer),
            "order_id": inv.order_id, "ticket_id": inv.ticket_id, "subtotal": f(inv.subtotal),
            "tax": f(inv.tax), "total": f(inv.total), "amount_paid": f(inv.amount_paid),
            "balance": f(inv.total - inv.amount_paid), "due_date": inv.due_date,
            "status": invoice_status(inv), "issued_at": inv.issued_at, "created_at": inv.created_at,
            "version": inv.version}
    if detail:
        data["lines"] = [{"id": ln.id, "description": ln.description, "qty": f(ln.qty),
                          "unit_price": f(ln.unit_price), "line_total": f(ln.line_total)} for ln in inv.lines]
        data["payments"] = [payment_out(p) for p in inv.payments]
    return data
