"""Quotes, orders and the order-confirm transaction (spec 6.3, 6.4)."""
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, not_found
from app.models import (Invoice, InvoiceLine, Job, KitTemplate, Order, OrderLine, Payment, PickList, Product,
                        StockUnit, SubsidyCase, SubsidyEvent, Survey, User)
from app.schemas.inputs import ConfirmIn, OrderUpdate, QuoteIn
from app.services.common import get_setting, log_activity, money, next_number, now, subsidy_for_kw
from app.services.crm import check_version, get_lead


def get_order(db: Session, order_id: int, lock: bool = False) -> Order:
    stmt = select(Order).where(Order.id == order_id).options(selectinload(Order.lines).selectinload(OrderLine.product))
    if lock:
        stmt = stmt.with_for_update(of=Order)
    o = db.execute(stmt).scalar_one_or_none()
    if not o:
        raise not_found("Order", order_id)
    return o


def _recalc(db: Session, order: Order) -> None:
    order.subtotal = money(sum((ln.line_total for ln in order.lines), Decimal(0)))
    gst = Decimal(str(get_setting(db, "gst_percent") or 0))
    order.tax = money(order.subtotal * gst / 100)
    order.total = money(order.subtotal + order.tax)
    order.expected_subsidy = subsidy_for_kw(db, order.capacity_kw) if order.is_subsidy else Decimal(0)


def _check_dcr(order: Order) -> None:
    """R-ORD-3: subsidy orders may only use DCR (domestically manufactured) panels."""
    if not order.is_subsidy:
        return
    bad = [ln.product.name for ln in order.lines if ln.product.category == "panel" and not ln.product.is_dcr]
    if bad:
        raise AppError("NON_DCR_PANEL_IN_SUBSIDY_ORDER",
                       "Subsidy orders can only use DCR (made-in-India) panels. Remove: " + ", ".join(bad) + ".",
                       400, {"products": bad})


def create_quote(db: Session, lead_id: int, data: QuoteIn, user: User) -> Order:
    lead = get_lead(db, lead_id, lock=True)
    # R-ORD-1: no quote until the site survey is approved
    approved = db.execute(select(Survey.id).where(Survey.lead_id == lead.id, Survey.status == "approved")).first()
    if not approved:
        raise AppError("SURVEY_NOT_APPROVED", "A quote can't be created until the site survey is approved.",
                       400, {"lead_id": lead.id})
    if lead.status in ("won", "lost"):
        raise AppError("LEAD_CLOSED", "This lead is closed.")
    kit = db.execute(select(KitTemplate).where(KitTemplate.id == data.kit_id)
                     .options(selectinload(KitTemplate.lines))).scalar_one_or_none()
    if not kit or not kit.is_active:
        raise AppError("INVALID_KIT", "Choose an active kit template.")
    if data.is_subsidy and kit.system_type == "panel_set":
        raise AppError("SUBSIDY_NEEDS_INSTALLATION", "PM Surya Ghar subsidy needs a grid-connected installed "
                                                    "system, not a panel-only set.")
    order = Order(number=next_number(db, "ORD"), lead_id=lead.id, customer_id=lead.customer_id, kit_id=kit.id,
                  capacity_kw=kit.capacity_kw, includes_installation=kit.includes_installation,
                  is_subsidy=data.is_subsidy, sanctioned_kw=data.sanctioned_kw or (kit.capacity_kw if data.is_subsidy else None),
                  status="draft")
    for kl in kit.lines:  # R-ORD-2: kit lines copied into the order
        p = kl.product
        if not p.is_active:
            continue
        order.lines.append(OrderLine(product=p, qty=kl.qty, unit_price=p.sale_price,
                                     line_total=money(p.sale_price * kl.qty)))
    _check_dcr(order)
    _recalc(db, order)
    db.add(order)
    lead.status = "quoted"
    lead.last_activity_at = now()
    db.flush()
    log_activity(db, user.id, "order", order.id, "quote_created", {"kit": kit.name, "lead_id": lead.id})
    db.commit()
    return get_order(db, order.id)


def update_order(db: Session, order_id: int, data: OrderUpdate, user: User) -> Order:
    order = get_order(db, order_id, lock=True)
    check_version(order, data.version)
    if order.status not in ("draft", "sent"):
        raise AppError("ORDER_LOCKED", "Only draft or sent quotes can be edited.")
    if data.is_subsidy is not None:
        order.is_subsidy = data.is_subsidy
    if data.sanctioned_kw is not None:
        order.sanctioned_kw = data.sanctioned_kw
    if data.lines is not None:
        if not data.lines:
            raise AppError("EMPTY_ORDER", "An order needs at least one line.")
        order.lines.clear()
        db.flush()
        for ln in data.lines:
            p = db.get(Product, ln.product_id)
            if not p or not p.is_active:  # R-KIT-2
                raise AppError("INVALID_PRODUCT", "One of the products is inactive or missing.", 400,
                               {"product_id": ln.product_id})
            price = money(ln.unit_price if ln.unit_price is not None else p.sale_price)
            order.lines.append(OrderLine(product=p, qty=ln.qty, unit_price=price, line_total=money(price * ln.qty)))
    _check_dcr(order)
    _recalc(db, order)
    log_activity(db, user.id, "order", order.id, "quote_updated")
    db.commit()
    return get_order(db, order.id)


def send_quote(db: Session, order_id: int, user: User) -> Order:
    order = get_order(db, order_id, lock=True)
    if order.status != "draft":
        raise AppError("INVALID_TRANSITION", "Only draft quotes can be sent.")
    _check_dcr(order)
    order.status = "sent"
    log_activity(db, user.id, "order", order.id, "quote_sent")
    db.commit()
    return order


def confirm_order(db: Session, order_id: int, data: ConfirmIn, user: User, idempotency_key: str | None) -> Order:
    """R-ORD-6: one transaction. Reserve stock, create pick list, job, invoice (+ advance payment), subsidy case.
    Any failure rolls back everything."""
    if idempotency_key:
        existing = db.execute(select(Payment).where(Payment.idempotency_key == idempotency_key)).scalar_one_or_none()
        if existing:  # replay of a confirm that already succeeded
            return get_order(db, order_id)
    order = get_order(db, order_id, lock=True)
    if order.status not in ("draft", "sent"):
        raise AppError("ALREADY_CONFIRMED", "This order is already confirmed.", 409)
    _check_dcr(order)
    _recalc(db, order)

    # R-ORD-5: advance (or full) payment is required before work starts
    min_pct = Decimal(str(get_setting(db, "min_advance_percent") or 30))
    advance = money(data.advance_amount)
    minimum = money(order.total * min_pct / 100)
    if advance < minimum:
        raise AppError("ADVANCE_TOO_LOW", f"An advance of at least {min_pct}% (₹{minimum:,.2f}) is required "
                                          "to confirm.", 400, {"minimum": float(minimum)})
    if advance > order.total:
        raise AppError("ADVANCE_TOO_HIGH", "The advance can't be more than the order total.")

    # 1. Reserve stock with row locks. SKIP LOCKED means two confirms never grab the same unit.
    shortages = []
    for ln in order.lines:
        p = db.execute(select(Product).where(Product.id == ln.product_id).with_for_update()).scalar_one()
        if p.category == "service":
            continue
        if p.is_serialized:
            units = db.execute(select(StockUnit).where(StockUnit.product_id == p.id, StockUnit.status == "in_stock")
                               .order_by(StockUnit.id).limit(ln.qty).with_for_update(skip_locked=True)).scalars().all()
            if len(units) < ln.qty:
                shortages.append({"product": p.name, "needed": ln.qty, "available": len(units)})
                continue
            for u in units:
                u.status = "reserved"
                u.order_id = order.id
        else:
            available = p.qty_on_hand - p.qty_reserved
            if available < ln.qty:
                shortages.append({"product": p.name, "needed": ln.qty, "available": available})
                continue
            p.qty_reserved += ln.qty
    if shortages:
        db.rollback()
        names = ", ".join(f"{s['product']} (need {s['needed']}, have {s['available']})" for s in shortages)
        raise AppError("INSUFFICIENT_STOCK", f"Not enough stock to confirm: {names}.", 409, {"shortages": shortages})

    # 2. Pick list for the warehouse
    db.add(PickList(order_id=order.id, status="pending"))
    # 3. Crew job (only if the kit includes installation)
    if order.includes_installation:
        db.add(Job(order_id=order.id, status="unscheduled"))
    # 4. Customer invoice (full price; subsidy is paid to the customer by DBT) + advance payment
    due_days = int(get_setting(db, "invoice_due_days") or 15)
    inv = Invoice(number=next_number(db, "INV"), customer_id=order.customer_id, order_id=order.id,
                  subtotal=order.subtotal, tax=order.tax, total=order.total, amount_paid=advance,
                  due_date=(now() + timedelta(days=due_days)).date(), issued_at=now(),
                  status="paid" if advance == order.total else "partially_paid")
    for ln in order.lines:
        inv.lines.append(InvoiceLine(description=ln.product.name, qty=ln.qty, unit_price=ln.unit_price,
                                     line_total=ln.line_total))
    db.add(inv)
    db.flush()
    db.add(Payment(invoice_id=inv.id, amount=advance, method=data.method, reference=data.reference,
                   idempotency_key=idempotency_key, recorded_by=user.id))
    # 5. Subsidy case
    if order.is_subsidy:
        case = SubsidyCase(order_id=order.id, stage="applied", stage_entered_at=now())
        db.add(case)
        db.flush()
        db.add(SubsidyEvent(case_id=case.id, from_stage=None, to_stage="applied", user_id=user.id,
                            note="Created on order confirmation"))
    order.status = "confirmed"
    order.confirmed_at = now()
    order.lead.status = "won"
    # 6. Audit trail
    log_activity(db, user.id, "order", order.id, "confirmed",
                 {"advance": float(advance), "invoice": inv.number, "subsidy": order.is_subsidy})
    db.commit()
    return get_order(db, order.id)


def cancel_order(db: Session, order_id: int, user: User, reason: str) -> Order:
    """R-ORD-7: cancelling a confirmed order releases its reservations."""
    order = get_order(db, order_id, lock=True)
    if order.status not in ("draft", "sent", "confirmed"):
        raise AppError("CANNOT_CANCEL", "Orders that have left the warehouse can't be cancelled. Raise a return instead.")
    if order.status == "confirmed":
        for u in db.execute(select(StockUnit).where(StockUnit.order_id == order.id).with_for_update()).scalars():
            u.status, u.order_id, u.scanned_at = "in_stock", None, None
        for ln in order.lines:
            p = db.execute(select(Product).where(Product.id == ln.product_id).with_for_update()).scalar_one()
            if not p.is_serialized and p.category != "service":
                p.qty_reserved = max(p.qty_reserved - ln.qty, 0)
        job = db.execute(select(Job).where(Job.order_id == order.id)).scalar_one_or_none()
        if job:
            job.status = "cancelled"
    order.status = "cancelled"
    log_activity(db, user.id, "order", order.id, "cancelled", {"reason": reason})
    db.commit()
    return order


def payback(db: Session, order: Order) -> dict:
    """Savings and payback estimate shown on the quote."""
    kw = float(order.capacity_kw)
    gen = float(get_setting(db, "gen_per_kw_per_day") or 4)
    tariff = float(get_setting(db, "tariff_per_unit") or 7.5)
    yearly_units = kw * gen * 365
    yearly_savings = yearly_units * tariff
    net_cost = float(order.total) - float(order.expected_subsidy or 0)
    years = round(net_cost / yearly_savings, 1) if yearly_savings else None
    return {"capacity_kw": kw, "yearly_units": round(yearly_units), "monthly_savings": round(yearly_savings / 12),
            "yearly_savings": round(yearly_savings), "expected_subsidy": float(order.expected_subsidy or 0),
            "net_cost": round(net_cost), "payback_years": years,
            "lifetime_savings_25y": round(yearly_savings * 25 * 0.9)}  # ~10% for panel degradation
