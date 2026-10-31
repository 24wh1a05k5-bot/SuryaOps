"""Catalog (products, kits, suppliers) and orders/quotes."""
from fastapi import APIRouter, Depends, Header
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.db import get_db
from app.core.deps import get_current_user, require_roles
from app.core.errors import AppError, not_found
from app.models import (Customer, Invoice, Job, KitLine, KitTemplate, Order, PickList, Product, StockUnit,
                        SubsidyCase, Supplier, User)
from app.schemas.inputs import CancelIn, ConfirmIn, OrderUpdate, QuoteIn
from app.services import sales
from app.services.common import paginate
from app.services.serializers import order_out, product_out, unit_out

router = APIRouter()
SALES = require_roles("sales")
READ = require_roles("sales", "warehouse", "accounts", "support", "technician")


@router.get("/products")
def list_products(category: str | None = None, active: bool | None = None, db: Session = Depends(get_db),
                  _: User = Depends(get_current_user)):
    stmt = select(Product).order_by(Product.category, Product.name)
    if category:
        stmt = stmt.where(Product.category == category)
    if active is not None:
        stmt = stmt.where(Product.is_active.is_(active))
    return [product_out(p) for p in db.execute(stmt).scalars()]


@router.get("/kits")
def list_kits(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    kits = db.execute(select(KitTemplate).where(KitTemplate.is_active.is_(True))
                      .options(selectinload(KitTemplate.lines).joinedload(KitLine.product))
                      .order_by(KitTemplate.system_type, KitTemplate.capacity_kw)).scalars().all()
    return [{"id": k.id, "name": k.name, "capacity_kw": float(k.capacity_kw), "system_type": k.system_type,
             "includes_installation": k.includes_installation,
             "price": float(sum(ln.product.sale_price * ln.qty for ln in k.lines)),
             "lines": [{"product": product_out(ln.product), "qty": ln.qty} for ln in k.lines]} for k in kits]


@router.get("/suppliers")
def list_suppliers(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return [{"id": s.id, "name": s.name, "phone": s.phone, "gstin": s.gstin}
            for s in db.execute(select(Supplier).order_by(Supplier.name)).scalars()]


@router.post("/leads/{lead_id}/quote", status_code=201)
def create_quote(lead_id: int, data: QuoteIn, db: Session = Depends(get_db), user: User = Depends(SALES)):
    return order_out(sales.create_quote(db, lead_id, data, user), detail=True)


@router.get("/orders")
def list_orders(page: int = 1, page_size: int = 25, q: str | None = None, status: str | None = None,
                subsidy: bool | None = None, db: Session = Depends(get_db), _: User = Depends(READ)):
    stmt = select(Order).join(Customer).options(joinedload(Order.customer), joinedload(Order.kit))
    if q:
        stmt = stmt.where(or_(Order.number.ilike(f"%{q}%"), Customer.name.ilike(f"%{q}%"),
                              Customer.phone.like(f"%{q}%")))
    if status:
        stmt = stmt.where(Order.status.in_(status.split(",")))
    if subsidy is not None:
        stmt = stmt.where(Order.is_subsidy.is_(subsidy))
    stmt = stmt.order_by(Order.created_at.desc(), Order.id.desc())
    return paginate(db, stmt, page, page_size, order_out)


@router.get("/orders/{order_id}")
def get_order(order_id: int, db: Session = Depends(get_db), _: User = Depends(READ)):
    from app.services.stock import pick_progress
    o = sales.get_order(db, order_id)
    data = order_out(o, detail=True)
    pl = db.execute(select(PickList).where(PickList.order_id == o.id)).scalar_one_or_none()
    data["pick_list"] = {"id": pl.id, "status": pl.status, "progress": pick_progress(db, o)} if pl else None
    job = db.execute(select(Job).where(Job.order_id == o.id)).scalar_one_or_none()
    data["job"] = {"id": job.id, "status": job.status, "technician_id": job.technician_id,
                   "scheduled_start": job.scheduled_start} if job else None
    inv = db.execute(select(Invoice).where(Invoice.order_id == o.id)).scalar_one_or_none()
    data["invoice"] = {"id": inv.id, "number": inv.number, "total": float(inv.total),
                       "amount_paid": float(inv.amount_paid), "status": inv.status} if inv else None
    case = db.execute(select(SubsidyCase).where(SubsidyCase.order_id == o.id)).scalar_one_or_none()
    data["subsidy_case"] = {"id": case.id, "stage": case.stage, "application_no": case.application_no} if case else None
    units = db.execute(select(StockUnit).where(StockUnit.order_id == o.id).order_by(StockUnit.id)).scalars().all()
    data["units"] = [unit_out(u) for u in units]
    from app.services.tracking import make_code
    data["tracking_code"] = make_code(o.id)
    data["payback"] = sales.payback(db, o)
    return data


@router.patch("/orders/{order_id}")
def patch_order(order_id: int, data: OrderUpdate, db: Session = Depends(get_db), user: User = Depends(SALES)):
    return order_out(sales.update_order(db, order_id, data, user), detail=True)


@router.post("/orders/{order_id}/send")
def send_order(order_id: int, db: Session = Depends(get_db), user: User = Depends(SALES)):
    return order_out(sales.send_quote(db, order_id, user))


@router.post("/orders/{order_id}/confirm")
def confirm(order_id: int, data: ConfirmIn, db: Session = Depends(get_db), user: User = Depends(SALES),
            idempotency_key: str | None = Header(default=None)):
    return order_out(sales.confirm_order(db, order_id, data, user, idempotency_key), detail=True)


@router.post("/orders/{order_id}/cancel")
def cancel(order_id: int, data: CancelIn, db: Session = Depends(get_db), user: User = Depends(SALES)):
    return order_out(sales.cancel_order(db, order_id, user, data.reason))


@router.get("/orders/{order_id}/payback")
def payback(order_id: int, db: Session = Depends(get_db), _: User = Depends(READ)):
    return sales.payback(db, sales.get_order(db, order_id))


@router.get("/orders/{order_id}/qr-sheet")
def qr_sheet(order_id: int, db: Session = Depends(get_db), _: User = Depends(READ)):
    from app.core.config import settings
    o = sales.get_order(db, order_id)
    units = db.execute(select(StockUnit).where(StockUnit.order_id == o.id, StockUnit.qr_token.is_not(None))
                       .order_by(StockUnit.id)).scalars().all()
    if not units:
        raise AppError("NO_QR_YET", "QR stickers are generated when the order is delivered.")
    return {"order": o.number, "customer": o.customer.name,
            "units": [{"serial_no": u.serial_no, "product": u.product.name, "warranty_end": u.warranty_end,
                       "qr_url": f"/api/v1/public/units/{u.qr_token}/qr.png",
                       "link": f"{settings.public_base_url}/u/{u.qr_token}"} for u in units]}