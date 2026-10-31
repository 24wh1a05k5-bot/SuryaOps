"""Purchases, stock receipt with serials, dispatch and delivery/warranty (spec 6.5, 6.6)."""
import secrets
from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.errors import AppError, not_found
from app.models import Order, PickList, Product, Purchase, PurchaseLine, StockUnit, Supplier, User
from app.schemas.inputs import PurchaseIn, ReceiveIn
from app.services.common import add_months, log_activity, money, next_number, now
from app.services.sales import get_order


# ----- Purchases -----

def get_purchase(db: Session, purchase_id: int, lock: bool = False) -> Purchase:
    stmt = select(Purchase).where(Purchase.id == purchase_id).options(
        selectinload(Purchase.lines).selectinload(PurchaseLine.product))
    if lock:
        stmt = stmt.with_for_update(of=Purchase)
    p = db.execute(stmt).scalar_one_or_none()
    if not p:
        raise not_found("Purchase", purchase_id)
    return p


def create_purchase(db: Session, data: PurchaseIn, user: User) -> Purchase:
    if not db.get(Supplier, data.supplier_id):
        raise AppError("INVALID_SUPPLIER", "Choose a supplier.")
    po = Purchase(number=next_number(db, "PO"), supplier_id=data.supplier_id, status="draft")
    total = 0
    for ln in data.lines:
        prod = db.get(Product, ln.product_id)
        if not prod or prod.category == "service":
            raise AppError("INVALID_PRODUCT", "Purchases can only include stock products.", 400,
                           {"product_id": ln.product_id})
        po.lines.append(PurchaseLine(product_id=prod.id, qty=ln.qty, unit_cost=money(ln.unit_cost)))
        total += ln.qty * ln.unit_cost
    po.total = money(total)
    db.add(po)
    db.flush()
    log_activity(db, user.id, "purchase", po.id, "created")
    db.commit()
    return get_purchase(db, po.id)


def mark_ordered(db: Session, purchase_id: int, user: User) -> Purchase:
    po = get_purchase(db, purchase_id, lock=True)
    if po.status != "draft":
        raise AppError("INVALID_TRANSITION", "Only draft purchases can be marked as ordered.")
    po.status, po.ordered_at = "ordered", now()
    log_activity(db, user.id, "purchase", po.id, "ordered")
    db.commit()
    return po


def receive_purchase(db: Session, purchase_id: int, data: ReceiveIn, user: User) -> Purchase:
    """R-PUR-1..4: serial count must equal qty, serials unique, receipt creates stock, receipt is final."""
    po = get_purchase(db, purchase_id, lock=True)
    if po.status == "received":
        raise AppError("ALREADY_RECEIVED", "This purchase was already received and can't be changed.", 409)
    if po.status not in ("draft", "ordered"):
        raise AppError("INVALID_TRANSITION", "This purchase can't be received.")
    by_line = {r.line_id: r.serials for r in data.lines}
    all_serials: list[str] = []
    errors = []
    for ln in po.lines:
        serials = by_line.get(ln.id, [])
        if ln.product.is_serialized:
            if len(serials) != ln.qty:
                errors.append(f"{ln.product.name}: {len(serials)} serials entered, {ln.qty} expected")
            all_serials.extend(serials)
    if errors:
        raise AppError("SERIAL_COUNT_MISMATCH", "Serial numbers don't match quantities. " + "; ".join(errors) + ".",
                       400, {"errors": errors})
    dupes_in_request = [s for s, c in Counter(all_serials).items() if c > 1]
    existing = db.execute(select(StockUnit.serial_no).where(StockUnit.serial_no.in_(all_serials))).scalars().all()
    dupes = sorted(set(dupes_in_request) | set(existing))
    if dupes:
        raise AppError("DUPLICATE_SERIAL", "These serial numbers already exist: " + ", ".join(dupes) + ".", 409,
                       {"serials": dupes})
    for ln in po.lines:
        prod = db.execute(select(Product).where(Product.id == ln.product_id).with_for_update()).scalar_one()
        if prod.is_serialized:
            for s in by_line.get(ln.id, []):
                db.add(StockUnit(product_id=prod.id, serial_no=s, purchase_line_id=ln.id, unit_cost=ln.unit_cost,
                                 status="in_stock"))
        else:
            prod.qty_on_hand += ln.qty
        if ln.unit_cost:  # keep the latest landed cost as the product's cost price
            prod.cost_price = ln.unit_cost
    po.status, po.received_at = "received", now()
    log_activity(db, user.id, "purchase", po.id, "received", {"serials": len(all_serials)})
    db.commit()
    return get_purchase(db, po.id)


def stock_summary(db: Session) -> list[dict]:
    counts = dict(db.execute(select(StockUnit.product_id, func.count()).where(StockUnit.status == "in_stock")
                             .group_by(StockUnit.product_id)).all())
    reserved = dict(db.execute(select(StockUnit.product_id, func.count()).where(StockUnit.status == "reserved")
                               .group_by(StockUnit.product_id)).all())
    # Supplier last used for each product, so a reorder can be pre-filled
    last_supplier = {}
    for pid, sid in db.execute(select(PurchaseLine.product_id, Purchase.supplier_id).join(Purchase)
                               .order_by(Purchase.created_at)).all():
        last_supplier[pid] = sid
    rows = []
    for p in db.execute(select(Product).where(Product.category != "service").order_by(Product.category,
                                                                                      Product.name)).scalars():
        if p.is_serialized:
            on_hand, res = counts.get(p.id, 0) + reserved.get(p.id, 0), reserved.get(p.id, 0)
        else:
            on_hand, res = p.qty_on_hand, p.qty_reserved
        available = on_hand - res
        rows.append({"product_id": p.id, "sku": p.sku, "name": p.name, "category": p.category,
                     "is_serialized": p.is_serialized, "is_dcr": p.is_dcr, "on_hand": on_hand, "reserved": res,
                     "available": available, "reorder_level": p.reorder_level,
                     "low_stock": available < p.reorder_level, "cost_price": float(p.cost_price),
                     "suggested_qty": max(p.reorder_level * 2 - available, 1) if available < p.reorder_level else 0,
                     "last_supplier_id": last_supplier.get(p.id),
                     "stock_value": float(p.cost_price) * on_hand})
    return rows


# ----- Dispatch -----

def get_pick_list(db: Session, pick_id: int, lock: bool = False) -> PickList:
    stmt = select(PickList).where(PickList.id == pick_id)
    if lock:
        stmt = stmt.with_for_update()
    pl = db.execute(stmt).scalar_one_or_none()
    if not pl:
        raise not_found("Pick list", pick_id)
    return pl


def pick_progress(db: Session, order: Order) -> list[dict]:
    units = db.execute(select(StockUnit).where(StockUnit.order_id == order.id)).scalars().all()
    rows = []
    for ln in order.lines:
        if ln.product.category == "service":
            continue
        mine = [u for u in units if u.product_id == ln.product_id]
        scanned = [u.serial_no for u in mine if u.scanned_at]
        rows.append({"product_id": ln.product_id, "name": ln.product.name, "qty": ln.qty,
                     "is_serialized": ln.product.is_serialized,
                     "scanned": len(scanned) if ln.product.is_serialized else ln.qty,
                     "serials": scanned, "done": (len(scanned) == ln.qty) if ln.product.is_serialized else True})
    return rows


def scan_serial(db: Session, pick_id: int, serial: str, user: User) -> dict:
    """R-DIS-1/2: serial must exist, be reserved for THIS order, match a product, and not be scanned twice."""
    pl = get_pick_list(db, pick_id, lock=True)
    if pl.status == "dispatched":
        raise AppError("ALREADY_DISPATCHED", "This order has already been dispatched.", 409)
    serial = serial.strip().upper()
    unit = db.execute(select(StockUnit).where(StockUnit.serial_no == serial).with_for_update()).scalar_one_or_none()
    if not unit:
        raise AppError("SERIAL_NOT_FOUND", f"Serial {serial} isn't in stock records. Check the label.", 404)
    if unit.order_id != pl.order_id:
        if unit.order_id:
            raise AppError("SERIAL_OTHER_ORDER", f"Serial {serial} is reserved for a different order.", 409)
        raise AppError("SERIAL_NOT_RESERVED", f"Serial {serial} isn't reserved for this order. Scan one of the "
                                              "reserved units.", 409)
    if unit.scanned_at:
        raise AppError("SERIAL_ALREADY_SCANNED", f"Serial {serial} was already scanned.", 409)
    if unit.status != "reserved":
        raise AppError("SERIAL_NOT_RESERVED", f"Serial {serial} is {unit.status.replace('_', ' ')}.", 409)
    unit.scanned_at = now()
    pl.status = "packed" if all(r["done"] for r in pick_progress(db, get_order(db, pl.order_id))) else "pending"
    log_activity(db, user.id, "order", pl.order_id, "serial_scanned", {"serial": serial})
    db.commit()
    order = get_order(db, pl.order_id)
    return {"serial": serial, "product": unit.product.name, "progress": pick_progress(db, order),
            "ready": all(r["done"] for r in pick_progress(db, order))}


def unscan_serial(db: Session, pick_id: int, serial: str, user: User) -> dict:
    pl = get_pick_list(db, pick_id, lock=True)
    if pl.status == "dispatched":
        raise AppError("ALREADY_DISPATCHED", "This order has already been dispatched.", 409)
    unit = db.execute(select(StockUnit).where(StockUnit.serial_no == serial.strip().upper(),
                                              StockUnit.order_id == pl.order_id)).scalar_one_or_none()
    if unit:
        unit.scanned_at = None
    pl.status = "pending"
    db.commit()
    return {"progress": pick_progress(db, get_order(db, pl.order_id))}


def dispatch(db: Session, pick_id: int, user: User) -> Order:
    """R-DIS-3: dispatch only when every serialized line is fully scanned."""
    pl = get_pick_list(db, pick_id, lock=True)
    order = get_order(db, pl.order_id, lock=True)
    if order.status != "confirmed":
        raise AppError("INVALID_TRANSITION", "Only confirmed orders can be dispatched.")
    missing = [f"{r['name']} ({r['scanned']}/{r['qty']})" for r in pick_progress(db, order) if not r["done"]]
    if missing:
        raise AppError("SCAN_INCOMPLETE", "Scan every serial before dispatch. Still missing: " + ", ".join(missing),
                       400, {"missing": missing})
    for u in db.execute(select(StockUnit).where(StockUnit.order_id == order.id).with_for_update()).scalars():
        u.status, u.dispatched_at = "dispatched", now()
    for ln in order.lines:
        p = db.execute(select(Product).where(Product.id == ln.product_id).with_for_update()).scalar_one()
        if not p.is_serialized and p.category != "service":
            p.qty_reserved -= ln.qty
            p.qty_on_hand -= ln.qty
    pl.status = "dispatched"
    order.status = "dispatched"
    log_activity(db, user.id, "order", order.id, "dispatched")
    db.commit()
    return get_order(db, order.id)


def deliver(db: Session, order_id: int, user: User) -> Order:
    """R-DIS-4: delivery starts every unit's warranty automatically. R-DIS-5: QR token per unit."""
    order = get_order(db, order_id, lock=True)
    if order.status != "dispatched":
        raise AppError("INVALID_TRANSITION", "Only dispatched orders can be marked delivered.")
    ts = now()
    for u in db.execute(select(StockUnit).where(StockUnit.order_id == order.id).with_for_update()).scalars():
        u.status, u.delivered_at, u.customer_id = "delivered", ts, order.customer_id
        u.warranty_end = add_months(ts.date(), u.product.warranty_months)
        u.qr_token = u.qr_token or secrets.token_urlsafe(16)
    order.status = "delivered"
    if not order.includes_installation:  # panel-only set: delivered -> completed
        order.status, order.completed_at = "completed", ts
    log_activity(db, user.id, "order", order.id, "delivered")
    db.commit()
    return get_order(db, order.id)


def lookup_serial(db: Session, serial: str) -> StockUnit:
    unit = db.execute(select(StockUnit).where(StockUnit.serial_no == serial.strip().upper())).scalar_one_or_none()
    if not unit:
        raise AppError("SERIAL_NOT_FOUND", f"No unit with serial {serial}.", 404)
    return unit