"""Customer tracking links: /track/<code>. The code is signed, so nobody can guess another customer's link."""
import hashlib
import hmac

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.models import Job, Order, StockUnit, SubsidyCase, User
from app.services import reports
from app.services.common import get_setting


def _sig(order_id: int) -> str:
    return hmac.new(settings.jwt_secret.encode(), f"track:{order_id}".encode(), hashlib.sha256).hexdigest()[:12]


def make_code(order_id: int) -> str:
    return f"{order_id}-{_sig(order_id)}"


def _order_for(db: Session, code: str) -> Order:
    oid, _, sig = code.partition("-")
    if not oid.isdigit() or not hmac.compare_digest(sig, _sig(int(oid))):
        raise AppError("TRACKING_NOT_FOUND", "This tracking link isn't valid. Check the link or call us.", 404)
    o = db.get(Order, int(oid))
    if not o or o.status in ("draft", "cancelled"):
        raise AppError("TRACKING_NOT_FOUND", "This tracking link isn't valid. Check the link or call us.", 404)
    return o


def public_track(db: Session, code: str) -> dict:
    o = _order_for(db, code)
    dispatched, delivered = db.execute(select(func.min(StockUnit.dispatched_at), func.min(StockUnit.delivered_at))
                                       .where(StockUnit.order_id == o.id)).one()
    job = db.execute(select(Job).where(Job.order_id == o.id)).scalar_one_or_none()
    tech = db.get(User, job.technician_id) if job and job.technician_id else None
    case = db.execute(select(SubsidyCase).where(SubsidyCase.order_id == o.id)).scalar_one_or_none()

    feas = case.feasibility_approved_at if case else None
    scheduled = job.scheduled_start if job else None
    accepted = job.accepted_at if job else None
    credited = case.subsidy_credited_at if case else None

    def step(key, label, at, note=None):
        return {"key": key, "label": label, "at": at, "done": at is not None, "note": note}

    steps = [step("sent", "Quote shared", o.created_at),
             step("confirmed", "Order confirmed", o.confirmed_at,
                  "Advance received. Your panels and inverter are reserved by serial number.")]
    if case:
        steps.append(step("feasibility", "DISCOM feasibility approved", feas,
                          "We install only after this approval, so your subsidy is safe."))
    steps += [step("dispatched", "Out for delivery", dispatched),
              step("delivered", "Delivered", delivered, "Your warranty started on the delivery date.")]
    if o.includes_installation:
        steps += [step("scheduled", "Installation booked", scheduled, f"Technician: {tech.name.split()[0]}" if tech else None),
                  step("installed", "Installed and handed over", accepted)]
    if case:
        amount = f"₹{int(o.expected_subsidy):,}" if o.expected_subsidy else None
        steps += [step("inspection", "Inspection submitted", case.inspection_submitted_at),
                  step("net_meter", "Net meter installed", case.net_meter_at),
                  step("subsidy", "Subsidy credited to your bank", credited,
                       (amount if credited else f"Expected {amount}") if amount else None)]
    current = next((s["key"] for s in steps if not s["done"]), None)
    c = o.customer
    return {"company": get_setting(db, "company_name"), "order": o.number, "system": o.kit.name,
            "capacity_kw": float(o.capacity_kw), "is_subsidy": o.is_subsidy, "owner": reports.mask_name(c.name),
            "city": c.city, "steps": steps, "current": current, "complete": current is None}