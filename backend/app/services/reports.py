"""Director dashboard, profit per job, CSV exports, shareable read-only reports, global search (spec 6.12)."""
import csv
import hashlib
import io
import secrets
import threading
import time
from collections import defaultdict
from datetime import date, datetime, time as dtime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import event, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.models import (Customer, Invoice, Job, Lead, Order, OrderLine, Product, ReportView, SharedReport, StockUnit,
                        SubsidyCase, Ticket, TicketLine, TimeLog, User)
from app.services.common import get_setting, now
from app.services.finance import pay_summary
from app.services.serializers import invoice_status

# ----- small TTL cache, cleared whenever orders / invoices / tickets / jobs change -----
_cache: dict = {}
_lock = threading.Lock()
_WATCHED = (Order, Invoice, Ticket, Job, SubsidyCase, TimeLog, TicketLine, StockUnit)


@event.listens_for(Session, "after_flush")
def _mark(session, ctx):
    if any(isinstance(o, _WATCHED) for o in list(session.new) + list(session.dirty) + list(session.deleted)):
        session.info["dashboard_dirty"] = True


@event.listens_for(Session, "after_commit")
def _clear(session):
    if session.info.pop("dashboard_dirty", False):
        with _lock:
            _cache.clear()


def _cached(key, fn):
    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < settings.dashboard_cache_seconds:
            return hit[1]
    value = fn()
    with _lock:
        _cache[key] = (time.monotonic(), value)
    return value


def _range(d_from: date, d_to: date):
    start = datetime.combine(d_from, dtime.min, tzinfo=timezone.utc)
    end = datetime.combine(d_to + timedelta(days=1), dtime.min, tzinfo=timezone.utc)
    return start, end


def mask_name(name: str) -> str:
    parts = name.split()
    if len(parts) == 1:
        return parts[0][0] + "."
    return f"{parts[0][0]}. {parts[-1]}"


# ----- profit per job -----

def profit_rows(db: Session, start: datetime, end: datetime) -> list[dict]:
    orders = db.execute(select(Order).where(Order.confirmed_at >= start, Order.confirmed_at < end,
                                            Order.status != "cancelled").order_by(Order.confirmed_at.desc())).scalars().all()
    if not orders:
        return []
    ids = [o.id for o in orders]
    replacement_ids = select(TicketLine.replacement_unit_id).where(TicketLine.replacement_unit_id.is_not(None))
    serial_cost = dict(db.execute(select(StockUnit.order_id, func.sum(StockUnit.unit_cost))
                                  .where(StockUnit.order_id.in_(ids), StockUnit.id.notin_(replacement_ids))
                                  .group_by(StockUnit.order_id)).all())
    bulk_cost = dict(db.execute(select(OrderLine.order_id, func.sum(OrderLine.qty * Product.cost_price))
                                .join(Product, Product.id == OrderLine.product_id)
                                .where(OrderLine.order_id.in_(ids), Product.is_serialized.is_(False),
                                       Product.category != "service").group_by(OrderLine.order_id)).all())
    labour = dict(db.execute(select(Job.order_id, func.sum(TimeLog.hours * User.hourly_rate))
                             .join(TimeLog, (TimeLog.source_type == "job") & (TimeLog.source_id == Job.id))
                             .join(User, User.id == TimeLog.technician_id)
                             .where(Job.order_id.in_(ids)).group_by(Job.order_id)).all())
    warranty = dict(db.execute(select(StockUnit.order_id, func.sum(TicketLine.unit_cost * TicketLine.qty))
                               .join(Ticket, Ticket.stock_unit_id == StockUnit.id)
                               .join(TicketLine, TicketLine.ticket_id == Ticket.id)
                               .where(StockUnit.order_id.in_(ids), Ticket.in_warranty.is_(True))
                               .group_by(StockUnit.order_id)).all())
    rows = []
    for o in orders:
        parts = float(serial_cost.get(o.id) or 0) + float(bulk_cost.get(o.id) or 0)
        lab = float(labour.get(o.id) or 0)
        war = float(warranty.get(o.id) or 0)
        revenue = float(o.total)
        cost = parts + lab + war
        profit = revenue - cost
        rows.append({"order_id": o.id, "number": o.number, "customer": o.customer.name,
                     "customer_masked": mask_name(o.customer.name), "city": o.customer.city,
                     "kit": o.kit.name, "capacity_kw": float(o.capacity_kw), "status": o.status,
                     "confirmed_at": o.confirmed_at.date().isoformat(), "revenue": round(revenue, 2),
                     "parts_cost": round(parts, 2), "labour_cost": round(lab, 2), "warranty_cost": round(war, 2),
                     "profit": round(profit, 2), "margin_pct": round(profit / revenue * 100, 1) if revenue else 0})
    return rows


# ----- dashboard -----

def dashboard(db: Session, d_from: date, d_to: date, public: bool = False) -> dict:
    return _cached(("dash", d_from, d_to, public), lambda: _build_dashboard(db, d_from, d_to, public))


def _build_dashboard(db: Session, d_from: date, d_to: date, public: bool) -> dict:
    start, end = _range(d_from, d_to)
    rows = profit_rows(db, start, end)
    tickets_in_period = db.execute(select(Ticket).where(Ticket.resolved_at >= start, Ticket.resolved_at < end)).scalars().all()
    ticket_rev = sum(float(ln.line_total) for t in tickets_in_period if not t.in_warranty for ln in t.lines)
    ticket_cost = sum(float(ln.unit_cost) * float(ln.qty) for t in tickets_in_period for ln in t.lines)
    revenue = sum(r["revenue"] for r in rows) + ticket_rev
    costs = sum(r["parts_cost"] + r["labour_cost"] for r in rows) + ticket_cost
    profit = revenue - costs

    today = date.today()
    open_jobs = db.execute(select(func.count()).select_from(Job)
                           .where(Job.status.in_(("unscheduled", "scheduled", "in_progress")))).scalar_one()
    open_tickets = db.execute(select(Ticket).where(Ticket.status.notin_(("resolved", "closed")))).scalars().all()
    overdue_tickets = [t for t in open_tickets if t.due_by < now()]
    unpaid = db.execute(select(Invoice).where(Invoice.status.in_(("sent", "partially_paid")))).scalars().all()
    outstanding = sum(float(i.total - i.amount_paid) for i in unpaid)
    overdue_invoices = [i for i in unpaid if i.due_date < today]

    sla = int(get_setting(db, "subsidy_stage_sla_days") or 30)
    cases = db.execute(select(SubsidyCase)).scalars().all()
    blocked = 0.0
    by_stage = defaultdict(lambda: {"count": 0, "overdue": 0, "days": 0})
    for c in cases:
        days = (now() - c.stage_entered_at).days
        s = by_stage[c.stage]
        s["count"] += 1
        s["days"] += days
        if c.stage != "subsidy_credited" and days > sla:
            s["overdue"] += 1
        if c.stage not in ("net_meter_installed", "subsidy_credited"):
            inv = db.execute(select(Invoice).where(Invoice.order_id == c.order_id)).scalar_one_or_none()
            if inv:
                blocked += float(inv.total - inv.amount_paid)
    from app.models import SUBSIDY_STAGES
    subsidy = [{"stage": st, "count": by_stage[st]["count"], "overdue": by_stage[st]["overdue"],
                "avg_days": round(by_stage[st]["days"] / by_stage[st]["count"], 1) if by_stage[st]["count"] else 0}
               for st in SUBSIDY_STAGES]

    # revenue vs cost over time (weekly buckets for ranges > 31 days, else daily)
    span = (d_to - d_from).days + 1
    weekly = span > 31
    buckets: dict[str, dict] = {}
    cursor = d_from
    while cursor <= d_to:
        key = (cursor - timedelta(days=cursor.weekday())) if weekly else cursor
        buckets.setdefault(key.isoformat(), {"period": key.isoformat(), "revenue": 0.0, "cost": 0.0, "profit": 0.0})
        cursor += timedelta(days=1)
    for r in rows:
        d = date.fromisoformat(r["confirmed_at"])
        key = (d - timedelta(days=d.weekday())) if weekly else d
        b = buckets.get(key.isoformat())
        if b:
            b["revenue"] += r["revenue"]
            b["cost"] += r["parts_cost"] + r["labour_cost"]
            b["profit"] = b["revenue"] - b["cost"]
    trend = [{k: (round(v, 2) if isinstance(v, float) else v) for k, v in b.items()} for b in buckets.values()]

    pipeline = dict(db.execute(select(Order.status, func.count()).group_by(Order.status)).all())
    stages = ["draft", "sent", "confirmed", "dispatched", "delivered", "completed"]
    jobs_by_stage = [{"stage": s, "count": pipeline.get(s, 0)} for s in stages]

    unfinished = db.execute(select(Order).where(Order.status.in_(("confirmed", "dispatched", "delivered")))
                            .order_by(Order.confirmed_at)).scalars().all()
    month = today.strftime("%Y-%m")
    tech_pay = [r for r in pay_summary(db, month) if not r["paid"]]

    def cust(name):
        return mask_name(name) if public else name

    data = {
        "period": {"from": d_from.isoformat(), "to": d_to.isoformat()},
        "kpis": {"revenue": round(revenue, 2), "costs": round(costs, 2), "profit": round(profit, 2),
                 "margin_pct": round(profit / revenue * 100, 1) if revenue else 0,
                 "jobs_confirmed": len(rows), "open_jobs": open_jobs, "open_tickets": len(open_tickets),
                 "overdue_tickets": len(overdue_tickets), "outstanding": round(outstanding, 2),
                 "overdue_invoices": len(overdue_invoices), "subsidy_blocked": round(blocked, 2),
                 "loss_making_jobs": sum(1 for r in rows if r["profit"] < 0)},
        "trend": trend,
        "jobs_by_stage": jobs_by_stage,
        "subsidy_by_stage": subsidy,
        "profit_per_job": [{**{k: v for k, v in r.items() if k not in ("customer", "customer_masked")},
                            "customer": r["customer_masked"] if public else r["customer"]} for r in rows],
        "unfinished": [{"order_id": o.id, "number": o.number, "customer": cust(o.customer.name), "status": o.status,
                        "days_open": (now() - o.confirmed_at).days if o.confirmed_at else 0} for o in unfinished],
        "open_tickets": [{"id": t.id, "number": t.number, "customer": cust(t.customer.name), "status": t.status,
                          "in_warranty": t.in_warranty, "days_left": round((t.due_by - now()).total_seconds() / 86400, 1)}
                         for t in sorted(open_tickets, key=lambda t: t.due_by)][:10],
        "invoices_outstanding": [{"id": i.id, "number": i.number, "customer": cust(i.customer.name),
                                  "balance": float(i.total - i.amount_paid), "due_date": i.due_date.isoformat(),
                                  "status": invoice_status(i)} for i in sorted(unpaid, key=lambda i: i.due_date)][:10],
        "technician_pay_due": [] if public else tech_pay,
        "generated_at": now().isoformat(),
    }
    return data


# ----- CSV exports -----

def csv_export(db: Session, name: str, d_from: date, d_to: date) -> str:
    start, end = _range(d_from, d_to)
    buf = io.StringIO()
    w = csv.writer(buf)
    if name == "profit_per_job":
        cols = ["number", "customer", "city", "kit", "capacity_kw", "status", "confirmed_at", "revenue",
                "parts_cost", "labour_cost", "warranty_cost", "profit", "margin_pct"]
        w.writerow(cols)
        for r in profit_rows(db, start, end):
            w.writerow([r[c] for c in cols])
    elif name == "invoices":
        w.writerow(["number", "customer", "issued", "due_date", "total", "paid", "balance", "status"])
        for i in db.execute(select(Invoice).where(Invoice.created_at >= start, Invoice.created_at < end)
                            .order_by(Invoice.created_at)).scalars():
            w.writerow([i.number, i.customer.name, i.issued_at.date() if i.issued_at else "", i.due_date,
                        i.total, i.amount_paid, i.total - i.amount_paid, invoice_status(i)])
    elif name == "tickets":
        w.writerow(["number", "customer", "serial", "opened", "status", "in_warranty", "due_by", "resolved_at"])
        for t in db.execute(select(Ticket).where(Ticket.created_at >= start, Ticket.created_at < end)
                            .order_by(Ticket.created_at)).scalars():
            w.writerow([t.number, t.customer.name, t.unit.serial_no if t.unit else "", t.created_at.date(), t.status,
                        "yes" if t.in_warranty else "no", t.due_by.date(), t.resolved_at.date() if t.resolved_at else ""])
    elif name == "technician_pay":
        w.writerow(["technician", "month", "hours", "rate", "amount", "paid"])
        month = d_from.strftime("%Y-%m")
        for r in pay_summary(db, month):
            w.writerow([r["technician"]["name"], month, r["hours"], r["hourly_rate"], r["amount"],
                        "yes" if r["paid"] else "no"])
    elif name == "subsidy":
        w.writerow(["order", "customer", "application_no", "stage", "days_in_stage"])
        for c in db.execute(select(SubsidyCase)).scalars():
            w.writerow([c.order.number, c.order.customer.name, c.application_no or "", c.stage,
                        (now() - c.stage_entered_at).days])
    else:
        raise AppError("UNKNOWN_REPORT", "Unknown report.", 404)
    return buf.getvalue()


# ----- shared, read-only report links -----

def create_share(db: Session, title: str, d_from: date, d_to: date, days: int, user: User) -> SharedReport:
    if d_to < d_from:
        raise AppError("INVALID_PERIOD", "The end date must be after the start date.")
    sr = SharedReport(token=secrets.token_urlsafe(32), title=title, period_start=d_from, period_end=d_to,
                      expires_at=now() + timedelta(days=days), created_by=user.id)
    db.add(sr)
    db.commit()
    return sr


def shared_out(db: Session, sr: SharedReport) -> dict:
    views = db.execute(select(func.count()).select_from(ReportView).where(ReportView.shared_report_id == sr.id)).scalar_one()
    return {"id": sr.id, "token": sr.token, "title": sr.title, "period_start": sr.period_start,
            "period_end": sr.period_end, "expires_at": sr.expires_at, "revoked": sr.revoked, "views": views,
            "url": f"{settings.public_base_url}/shared/{sr.token}", "created_at": sr.created_at,
            "active": not sr.revoked and sr.expires_at > now()}


def view_shared(db: Session, token: str, ip: str | None) -> dict:
    sr = db.execute(select(SharedReport).where(SharedReport.token == token)).scalar_one_or_none()
    if not sr or sr.revoked:
        raise AppError("LINK_INVALID", "This report link isn't valid or was revoked.", 404)
    if sr.expires_at < now():
        raise AppError("LINK_EXPIRED", "This report link has expired. Ask for a new one.", 410)
    db.add(ReportView(shared_report_id=sr.id, ip_hash=hashlib.sha256((ip or "").encode()).hexdigest()))
    db.commit()
    return {"title": sr.title, "company": get_setting(db, "company_name"), "expires_at": sr.expires_at,
            "dashboard": dashboard(db, sr.period_start, sr.period_end, public=True)}


# ----- global search (command palette) -----

def search(db: Session, q: str) -> list[dict]:
    q = q.strip()
    if len(q) < 2:
        return []
    like = f"%{q}%"
    out = []
    for c in db.execute(select(Customer).where(or_(Customer.name.ilike(like), Customer.phone.like(like))).limit(5)).scalars():
        lead = db.execute(select(Lead).where(Lead.customer_id == c.id).order_by(Lead.id.desc())).scalars().first()
        out.append({"type": "customer", "id": c.id, "title": c.name, "subtitle": f"{c.phone} · {c.city or ''}",
                    "url": f"/leads/{lead.id}" if lead else "/leads"})
    for u in db.execute(select(StockUnit).where(StockUnit.serial_no.ilike(like)).limit(5)).scalars():
        sub = f"{u.product.name} · {u.status.replace('_', ' ')}"
        if u.warranty_end:
            sub += f" · warranty to {u.warranty_end:%d %b %Y}"
        out.append({"type": "serial", "id": u.id, "title": u.serial_no, "subtitle": sub,
                    "url": f"/stock?serial={u.serial_no}"})
    for o in db.execute(select(Order).where(Order.number.ilike(like)).limit(5)).scalars():
        out.append({"type": "order", "id": o.id, "title": o.number, "subtitle": f"{o.customer.name} · {o.status}",
                    "url": f"/orders/{o.id}"})
    for t in db.execute(select(Ticket).where(Ticket.number.ilike(like)).limit(5)).scalars():
        out.append({"type": "ticket", "id": t.id, "title": t.number, "subtitle": f"{t.customer.name} · {t.status}",
                    "url": f"/tickets/{t.id}"})
    for i in db.execute(select(Invoice).where(Invoice.number.ilike(like)).limit(5)).scalars():
        out.append({"type": "invoice", "id": i.id, "title": i.number, "subtitle": f"{i.customer.name} · ₹{i.total:,.0f}",
                    "url": f"/invoices/{i.id}"})
    return out
