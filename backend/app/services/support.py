"""Service tickets: warranty check, 15-day SLA, parts + labour, auto-invoicing (spec 6.10)."""
import secrets
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, not_found
from app.models import Customer, Invoice, InvoiceLine, Product, StockUnit, Ticket, TicketLine, TimeLog, User
from app.schemas.inputs import TicketIn, TicketLineIn, TicketUpdate
from app.services.common import add_months, get_setting, log_activity, money, next_number, now
from app.services.crm import check_version
from app.services.field import photos_for


def get_ticket(db: Session, ticket_id: int, lock: bool = False) -> Ticket:
    stmt = select(Ticket).where(Ticket.id == ticket_id).options(selectinload(Ticket.lines))
    if lock:
        stmt = stmt.with_for_update(of=Ticket)
    t = db.execute(stmt).scalar_one_or_none()
    if not t:
        raise not_found("Ticket", ticket_id)
    return t


def open_ticket(db: Session, data: TicketIn, user: User | None, unit: StockUnit | None = None) -> Ticket:
    if unit is None and data.serial:
        unit = db.execute(select(StockUnit).where(StockUnit.serial_no == data.serial.strip().upper())).scalar_one_or_none()
        if not unit:
            raise AppError("SERIAL_NOT_FOUND", f"No unit with serial {data.serial}.", 404)
    customer_id = unit.customer_id if unit else data.customer_id
    if not customer_id or not db.get(Customer, customer_id):
        raise AppError("CUSTOMER_REQUIRED", "Pick a customer or a delivered unit's serial number.")
    if unit:
        if not unit.customer_id:
            raise AppError("UNIT_NOT_DELIVERED", "That unit hasn't been delivered to a customer yet.")
        # R-TKT-6: one open ticket per unit
        open_t = db.execute(select(Ticket).where(Ticket.stock_unit_id == unit.id,
                                                 Ticket.status.notin_(("resolved", "closed")))).scalar_one_or_none()
        if open_t:
            raise AppError("TICKET_ALREADY_OPEN", f"Ticket {open_t.number} is already open for this unit.", 409,
                           {"ticket_id": open_t.id, "number": open_t.number})
    in_warranty = bool(unit and unit.warranty_end and date.today() <= unit.warranty_end)  # R-TKT-1
    sla = int(get_setting(db, "ticket_sla_days") or 15)
    t = Ticket(number=next_number(db, "TKT"), customer_id=customer_id, stock_unit_id=unit.id if unit else None,
               channel=data.channel, issue=data.issue, fault_code=data.fault_code, in_warranty=in_warranty,
               status="open", due_by=now() + timedelta(days=sla))  # R-TKT-2
    db.add(t)
    db.flush()
    log_activity(db, user.id if user else None, "ticket", t.id, "opened",
                 {"channel": data.channel, "in_warranty": in_warranty})
    db.commit()
    return get_ticket(db, t.id)


def update_ticket(db: Session, ticket_id: int, data: TicketUpdate, user: User) -> Ticket:
    t = get_ticket(db, ticket_id, lock=True)
    check_version(t, data.version)
    if t.status in ("resolved", "closed"):
        raise AppError("TICKET_CLOSED", "This ticket is already resolved.")
    if data.assigned_to is not None:
        tech = db.get(User, data.assigned_to)
        if not tech or tech.role != "technician":
            raise AppError("INVALID_TECHNICIAN", "Assign the ticket to a technician.")
        t.assigned_to = tech.id
        if t.status == "open":
            t.status = "assigned"
    if data.status == "in_progress":
        if not t.assigned_to:
            raise AppError("NOT_ASSIGNED", "Assign a technician first.")
        t.status, t.started_at = "in_progress", t.started_at or now()
    log_activity(db, user.id, "ticket", t.id, "updated")
    db.commit()
    return get_ticket(db, t.id)


def add_line(db: Session, ticket_id: int, data: TicketLineIn, user: User) -> Ticket:
    """R-TKT-3: parts from stock (replacement serial gets its own warranty) or labour hours."""
    t = get_ticket(db, ticket_id, lock=True)
    if t.status not in ("assigned", "in_progress"):
        raise AppError("INVALID_TRANSITION", "Assign and start the ticket before adding parts or labour.")
    qty = Decimal(str(data.qty))
    if data.is_labour:
        tech = db.get(User, t.assigned_to) if t.assigned_to else None
        rate = money(data.unit_price if data.unit_price is not None else get_setting(db, "default_labour_rate"))
        cost = money(tech.hourly_rate if tech else 0)
        line = TicketLine(is_labour=True, description=data.description or "Labour", qty=qty, unit_price=rate,
                          unit_cost=cost, line_total=money(rate * qty))
    else:
        p = db.get(Product, data.product_id) if data.product_id else None
        if not p:
            raise AppError("INVALID_PRODUCT", "Choose the part used.")
        replacement = None
        unit_cost = p.cost_price
        if p.is_serialized:
            if not data.replacement_serial:
                raise AppError("REPLACEMENT_SERIAL_REQUIRED", f"{p.name} is serial-tracked. Scan the replacement's serial.")
            replacement = db.execute(select(StockUnit).where(StockUnit.serial_no == data.replacement_serial.strip().upper())
                                     .with_for_update()).scalar_one_or_none()
            if not replacement or replacement.product_id != p.id or replacement.status != "in_stock":
                raise AppError("REPLACEMENT_NOT_AVAILABLE", "That replacement serial isn't available in stock.")
            qty = Decimal(1)
            unit_cost = replacement.unit_cost
            ts = now()
            replacement.status, replacement.customer_id = "installed", t.customer_id
            replacement.delivered_at, replacement.warranty_end = ts, add_months(ts.date(), p.warranty_months)
            replacement.qr_token = secrets.token_urlsafe(16)
            if t.unit and t.unit.product_id == p.id:
                t.unit.status = "returned"
        else:
            locked = db.execute(select(Product).where(Product.id == p.id).with_for_update()).scalar_one()
            if locked.qty_on_hand - locked.qty_reserved < qty:
                raise AppError("INSUFFICIENT_STOCK", f"Not enough {p.name} in stock.", 409)
            locked.qty_on_hand -= int(qty)
        price = money(data.unit_price if data.unit_price is not None else p.sale_price)
        line = TicketLine(is_labour=False, product_id=p.id, replacement_unit_id=replacement.id if replacement else None,
                          description=data.description or (f"{p.name} ({replacement.serial_no})" if replacement else p.name),
                          qty=qty, unit_price=price, unit_cost=money(unit_cost), line_total=money(price * qty))
    t.lines.append(line)
    if t.status == "assigned":
        t.status, t.started_at = "in_progress", now()
    log_activity(db, user.id, "ticket", t.id, "line_added", {"description": line.description})
    db.commit()
    return get_ticket(db, t.id)


def resolve_ticket(db: Session, ticket_id: int, user: User) -> tuple[Ticket, Invoice | None]:
    """R-TKT-4/5: needs a geo-tagged after-repair photo. In warranty: customer pays 0, costs still tracked.
    Out of warranty: invoice created automatically."""
    t = get_ticket(db, ticket_id, lock=True)
    if t.status != "in_progress":
        raise AppError("INVALID_TRANSITION", "Only tickets in progress can be resolved.")
    after = [p for p in photos_for(db, "ticket", t.id) if p.kind == "after_repair"]
    if not after:
        raise AppError("AFTER_REPAIR_PHOTO_REQUIRED", "Add an after-repair photo as proof of the fix.")
    if not any(p.lat is not None and p.lng is not None for p in after):
        raise AppError("PHOTO_NOT_GEOTAGGED", "The after-repair photo needs GPS location (MNRE requires geo-tagged "
                                              "proof). Enable location and retake it.")
    if not t.lines:
        raise AppError("NO_WORK_RECORDED", "Record the parts or labour used before resolving.")
    t.status, t.resolved_at = "resolved", now()
    if t.started_at and t.assigned_to:
        start = t.started_at
        end = max(t.resolved_at, start + timedelta(minutes=15))
        hours = sum((ln.qty for ln in t.lines if ln.is_labour), Decimal(0)) or \
            Decimal(str(round((end - start).total_seconds() / 3600, 2)))
        db.add(TimeLog(technician_id=t.assigned_to, source_type="ticket", source_id=t.id, started_at=start,
                       ended_at=start + timedelta(hours=float(hours)), hours=hours))
    invoice = None
    billable = sum((ln.line_total for ln in t.lines), Decimal(0))
    if not t.in_warranty and billable > 0:
        due_days = int(get_setting(db, "invoice_due_days") or 15)
        invoice = Invoice(number=next_number(db, "INV"), customer_id=t.customer_id, ticket_id=t.id,
                          subtotal=money(billable), tax=Decimal(0), total=money(billable), amount_paid=Decimal(0),
                          due_date=date.today() + timedelta(days=due_days), status="sent", issued_at=now())
        for ln in t.lines:
            invoice.lines.append(InvoiceLine(description=ln.description, qty=ln.qty, unit_price=ln.unit_price,
                                             line_total=ln.line_total))
        db.add(invoice)
    log_activity(db, user.id, "ticket", t.id, "resolved",
                 {"in_warranty": t.in_warranty, "invoice": invoice.number if invoice else None})
    db.commit()
    return get_ticket(db, t.id), invoice


def close_ticket(db: Session, ticket_id: int, confirmed: bool, user: User) -> Ticket:
    t = get_ticket(db, ticket_id, lock=True)
    if t.status != "resolved":
        raise AppError("INVALID_TRANSITION", "Resolve the ticket before closing it.")
    if not confirmed:
        raise AppError("CUSTOMER_CONFIRMATION_REQUIRED", "The customer must confirm the fix before closing.")
    t.status, t.customer_confirmed_at = "closed", now()
    log_activity(db, user.id, "ticket", t.id, "closed")
    db.commit()
    return t
