"""Invoices, payments (idempotent, overpayment-proof) and technician pay runs (spec 6.8, 6.11)."""
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, not_found
from app.models import Invoice, Payment, PayRun, TimeLog, User
from app.schemas.inputs import PaymentIn
from app.services.common import add_months, log_activity, money, now


def get_invoice(db: Session, invoice_id: int, lock: bool = False) -> Invoice:
    stmt = select(Invoice).where(Invoice.id == invoice_id).options(selectinload(Invoice.lines),
                                                                   selectinload(Invoice.payments))
    if lock:
        stmt = stmt.with_for_update(of=Invoice)
    inv = db.execute(stmt).scalar_one_or_none()
    if not inv:
        raise not_found("Invoice", invoice_id)
    return inv


def send_invoice(db: Session, invoice_id: int, user: User) -> Invoice:
    inv = get_invoice(db, invoice_id, lock=True)
    if inv.status != "draft":
        raise AppError("INVALID_TRANSITION", "This invoice has already been sent.")
    inv.status, inv.issued_at = "sent", now()
    log_activity(db, user.id, "invoice", inv.id, "sent")
    db.commit()
    return inv


def record_payment(db: Session, invoice_id: int, data: PaymentIn, user: User, idempotency_key: str | None) -> Payment:
    """R-INV-1..3: row lock, idempotency key, never more than the balance (DB CHECK is the backstop)."""
    if not idempotency_key:
        raise AppError("IDEMPOTENCY_KEY_REQUIRED", "Missing Idempotency-Key header.", 400)
    existing = db.execute(select(Payment).where(Payment.idempotency_key == idempotency_key)).scalar_one_or_none()
    if existing:
        return existing  # a retried / double-clicked request returns the original payment
    inv = get_invoice(db, invoice_id, lock=True)
    if inv.status in ("paid", "cancelled"):
        raise AppError("INVOICE_SETTLED", "This invoice is already fully paid.", 409)
    amount = money(data.amount)
    balance = inv.total - inv.amount_paid
    if amount > balance:
        raise AppError("OVERPAYMENT", f"That's more than the balance due (₹{balance:,.2f}).", 400,
                       {"balance": float(balance)})
    pay = Payment(invoice_id=inv.id, amount=amount, method=data.method, reference=data.reference,
                  idempotency_key=idempotency_key, recorded_by=user.id)
    db.add(pay)
    inv.amount_paid = inv.amount_paid + amount
    inv.status = "paid" if inv.amount_paid == inv.total else "partially_paid"
    log_activity(db, user.id, "invoice", inv.id, "payment_recorded", {"amount": float(amount), "method": data.method})
    db.commit()
    return pay


def _month_bounds(month: str) -> tuple[date, date]:
    start = date.fromisoformat(month + "-01")
    return start, add_months(start, 1)


def pay_summary(db: Session, month: str) -> list[dict]:
    start, end = _month_bounds(month)
    hours = dict(db.execute(select(TimeLog.technician_id, func.sum(TimeLog.hours))
                            .where(TimeLog.started_at >= start, TimeLog.started_at < end)
                            .group_by(TimeLog.technician_id)).all())
    jobs = dict(db.execute(select(TimeLog.technician_id, func.count())
                           .where(TimeLog.started_at >= start, TimeLog.started_at < end)
                           .group_by(TimeLog.technician_id)).all())
    runs = {r.technician_id: r for r in db.execute(select(PayRun).where(PayRun.month == start)).scalars()}
    rows = []
    for tech in db.execute(select(User).where(User.role == "technician").order_by(User.name)).scalars():
        h = Decimal(hours.get(tech.id) or 0)
        run = runs.get(tech.id)
        rows.append({"technician": {"id": tech.id, "name": tech.name}, "hourly_rate": float(tech.hourly_rate),
                     "hours": float(h), "tasks": jobs.get(tech.id, 0), "amount": float(money(h * tech.hourly_rate)),
                     "paid": run is not None, "paid_at": run.paid_at if run else None,
                     "paid_amount": float(run.amount) if run else None})
    return rows


def create_pay_run(db: Session, technician_id: int, month: str, user: User) -> PayRun:
    """R-PAY-1: UNIQUE(technician_id, month) — a month can't be paid twice."""
    start, _ = _month_bounds(month)
    if start > date.today():
        raise AppError("FUTURE_MONTH", "You can't pay a month that hasn't started.")
    if db.execute(select(PayRun).where(PayRun.technician_id == technician_id, PayRun.month == start)).scalar_one_or_none():
        raise AppError("ALREADY_PAID", "This technician has already been paid for that month.", 409)
    row = next((r for r in pay_summary(db, month) if r["technician"]["id"] == technician_id), None)
    if not row:
        raise AppError("INVALID_TECHNICIAN", "Technician not found.", 404)
    if row["hours"] <= 0:
        raise AppError("NO_HOURS", "No logged hours for that month.")
    run = PayRun(technician_id=technician_id, month=start, hours=Decimal(str(row["hours"])),
                 amount=Decimal(str(row["amount"])), paid_by=user.id)
    db.add(run)
    db.flush()
    log_activity(db, user.id, "pay_run", run.id, "paid", {"technician_id": technician_id, "month": month})
    db.commit()
    return run
