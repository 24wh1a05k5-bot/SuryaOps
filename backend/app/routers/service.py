"""Tickets, invoices, payments, technician pay, dashboard, reports, sharing, public endpoints."""
import io
from datetime import date, datetime

import qrcode
from fastapi import APIRouter, Depends, File, Form, Header, Request, UploadFile
from fastapi.responses import PlainTextResponse, StreamingResponse
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import require_roles
from app.core.errors import AppError
from app.core.ratelimit import limiter
from app.models import Customer, Invoice, SharedReport, StockUnit, Ticket, User
from app.schemas.inputs import (PaymentIn, PayRunIn, PublicLeadIn, PublicTicketIn, SharedReportIn, TicketCloseIn,
                                TicketIn, TicketLineIn, TicketUpdate)
from app.services import crm, finance, reports, support
from app.services.common import get_setting, paginate
from app.services.field import add_photo, photos_for
from app.services.serializers import invoice_out, payment_out, photo_out, ticket_out, user_brief

router = APIRouter()
SUPPORT = require_roles("support", "technician")


# ----- tickets -----

def _ticket_detail(db: Session, t: Ticket):
    data = ticket_out(t, detail=True)
    data["photos"] = [photo_out(p) for p in photos_for(db, "ticket", t.id)]
    data["technician"] = user_brief(db.get(User, t.assigned_to)) if t.assigned_to else None
    inv = db.execute(select(Invoice).where(Invoice.ticket_id == t.id)).scalar_one_or_none()
    data["invoice"] = {"id": inv.id, "number": inv.number, "total": float(inv.total), "status": inv.status} if inv else None
    return data


@router.get("/tickets")
def list_tickets(page: int = 1, page_size: int = 25, q: str | None = None, status: str | None = None,
                 overdue: bool = False, db: Session = Depends(get_db), user: User = Depends(SUPPORT)):
    from app.services.common import now
    stmt = select(Ticket).join(Customer).options(joinedload(Ticket.customer), joinedload(Ticket.unit))
    if user.role == "technician":
        stmt = stmt.where(Ticket.assigned_to == user.id)
    if q:
        stmt = stmt.outerjoin(StockUnit, StockUnit.id == Ticket.stock_unit_id).where(or_(
            Ticket.number.ilike(f"%{q}%"), Customer.name.ilike(f"%{q}%"), Customer.phone.like(f"%{q}%"),
            StockUnit.serial_no.ilike(f"%{q}%")))
    if status:
        stmt = stmt.where(Ticket.status.in_(status.split(",")))
    if overdue:
        stmt = stmt.where(Ticket.status.notin_(("resolved", "closed")), Ticket.due_by < now())
    stmt = stmt.order_by(Ticket.created_at.desc())
    return paginate(db, stmt, page, page_size, ticket_out)


@router.post("/tickets", status_code=201)
def create_ticket(data: TicketIn, db: Session = Depends(get_db), user: User = Depends(require_roles("support"))):
    return _ticket_detail(db, support.open_ticket(db, data, user))


@router.get("/tickets/{ticket_id}")
def get_ticket(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(SUPPORT)):
    t = support.get_ticket(db, ticket_id)
    if user.role == "technician" and t.assigned_to != user.id:
        raise AppError("FORBIDDEN", "This ticket is assigned to another technician.", 403)
    return _ticket_detail(db, t)


@router.patch("/tickets/{ticket_id}")
def patch_ticket(ticket_id: int, data: TicketUpdate, db: Session = Depends(get_db), user: User = Depends(SUPPORT)):
    return _ticket_detail(db, support.update_ticket(db, ticket_id, data, user))


@router.post("/tickets/{ticket_id}/lines")
def add_line(ticket_id: int, data: TicketLineIn, db: Session = Depends(get_db), user: User = Depends(SUPPORT)):
    return _ticket_detail(db, support.add_line(db, ticket_id, data, user))


@router.post("/tickets/{ticket_id}/photos", status_code=201)
async def ticket_photo(ticket_id: int, kind: str = Form("after_repair"), lat: float | None = Form(default=None),
                       lng: float | None = Form(default=None), taken_at: datetime | None = Form(default=None),
                       file: UploadFile = File(...), db: Session = Depends(get_db), user: User = Depends(SUPPORT)):
    t = support.get_ticket(db, ticket_id)
    content = await file.read()
    return photo_out(add_photo(db, "ticket", t.id, kind, content, file.content_type, lat, lng, taken_at))


@router.post("/tickets/{ticket_id}/resolve")
def resolve(ticket_id: int, db: Session = Depends(get_db), user: User = Depends(SUPPORT)):
    t, _ = support.resolve_ticket(db, ticket_id, user)
    return _ticket_detail(db, t)


@router.post("/tickets/{ticket_id}/close")
def close(ticket_id: int, data: TicketCloseIn, db: Session = Depends(get_db), user: User = Depends(SUPPORT)):
    return _ticket_detail(db, support.close_ticket(db, ticket_id, data.customer_confirmed, user))


# ----- invoices -----

@router.get("/invoices")
def list_invoices(page: int = 1, page_size: int = 25, q: str | None = None, status: str | None = None,
                  db: Session = Depends(get_db), _: User = Depends(require_roles("accounts", "sales"))):
    stmt = select(Invoice).join(Customer).options(joinedload(Invoice.customer))
    if q:
        stmt = stmt.where(or_(Invoice.number.ilike(f"%{q}%"), Customer.name.ilike(f"%{q}%")))
    if status == "overdue":
        stmt = stmt.where(Invoice.status.in_(("sent", "partially_paid")), Invoice.due_date < date.today())
    elif status:
        stmt = stmt.where(Invoice.status.in_(status.split(",")))
    stmt = stmt.order_by(Invoice.created_at.desc())
    return paginate(db, stmt, page, page_size, invoice_out)


@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: int, db: Session = Depends(get_db), _: User = Depends(require_roles("accounts", "sales"))):
    inv = finance.get_invoice(db, invoice_id)
    return {**invoice_out(inv, detail=True), "company": get_setting(db, "company_name")}


@router.post("/invoices/{invoice_id}/send")
def send(invoice_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("accounts"))):
    return invoice_out(finance.send_invoice(db, invoice_id, user))


@router.post("/invoices/{invoice_id}/payments", status_code=201)
def pay(invoice_id: int, data: PaymentIn, db: Session = Depends(get_db), user: User = Depends(require_roles("accounts")),
        idempotency_key: str | None = Header(default=None)):
    p = finance.record_payment(db, invoice_id, data, user, idempotency_key)
    return {"payment": payment_out(p), "invoice": invoice_out(finance.get_invoice(db, invoice_id), detail=True)}


# ----- technician pay -----

@router.get("/technicians/pay")
def tech_pay(month: str | None = None, db: Session = Depends(get_db), _: User = Depends(require_roles("accounts"))):
    month = month or date.today().strftime("%Y-%m")
    return {"month": month, "rows": finance.pay_summary(db, month)}


@router.post("/technicians/{tech_id}/pay-runs", status_code=201)
def pay_run(tech_id: int, data: PayRunIn, db: Session = Depends(get_db), user: User = Depends(require_roles("accounts"))):
    run = finance.create_pay_run(db, tech_id, data.month, user)
    return {"id": run.id, "amount": float(run.amount), "hours": float(run.hours), "paid_at": run.paid_at}


# ----- dashboard, reports, sharing -----

def _period(d_from: str | None, d_to: str | None) -> tuple[date, date]:
    today = date.today()
    try:
        start = date.fromisoformat(d_from) if d_from else today.replace(day=1)
        end = date.fromisoformat(d_to) if d_to else today
    except ValueError:
        raise AppError("INVALID_DATE", "Dates must be YYYY-MM-DD.", 422)
    if end < start:
        raise AppError("INVALID_PERIOD", "The end date must be after the start date.")
    return start, end


@router.get("/dashboard")
def dashboard(d_from: str | None = None, d_to: str | None = None, db: Session = Depends(get_db),
              _: User = Depends(require_roles("accounts"))):
    start, end = _period(d_from, d_to)
    return reports.dashboard(db, start, end)


@router.get("/reports/{name}.csv")
def csv_report(name: str, d_from: str | None = None, d_to: str | None = None, db: Session = Depends(get_db),
               _: User = Depends(require_roles("accounts"))):
    start, end = _period(d_from, d_to)
    body = reports.csv_export(db, name, start, end)
    return PlainTextResponse(body, media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="{name}_{start}_{end}.csv"'})


@router.get("/shared-reports")
def list_shares(db: Session = Depends(get_db), _: User = Depends(require_roles())):
    rows = db.execute(select(SharedReport).order_by(SharedReport.created_at.desc()).limit(50)).scalars()
    return [reports.shared_out(db, r) for r in rows]


@router.post("/shared-reports", status_code=201)
def create_share(data: SharedReportIn, db: Session = Depends(get_db), user: User = Depends(require_roles())):
    start, end = _period(data.period_start, data.period_end)
    return reports.shared_out(db, reports.create_share(db, data.title, start, end, data.expires_in_days, user))


@router.delete("/shared-reports/{share_id}")
def revoke_share(share_id: int, db: Session = Depends(get_db), _: User = Depends(require_roles())):
    sr = db.get(SharedReport, share_id)
    if not sr:
        raise AppError("NOT_FOUND", "Link not found.", 404)
    sr.revoked = True
    db.commit()
    return reports.shared_out(db, sr)


# ----- public (no login, rate limited, minimum data) -----

public = APIRouter(prefix="/public")


@public.post("/leads", status_code=201)
@limiter.limit("5/minute")
def public_lead(request: Request, data: PublicLeadIn, db: Session = Depends(get_db)):
    lead, _ = crm.create_lead(db, data, None, source="web")
    return {"ok": True, "reference": f"ENQ-{lead.id:05d}",
            "message": "Thanks! Our team will call you within one working day."}


def _unit_by_token(db: Session, token: str) -> StockUnit:
    u = db.execute(select(StockUnit).where(StockUnit.qr_token == token)).scalar_one_or_none()
    if not u or not u.customer_id:
        raise AppError("UNIT_NOT_FOUND", "We couldn't find this device. Check the sticker or call support.", 404)
    return u


@public.get("/units/{token}")
@limiter.limit("30/minute")
def public_unit(request: Request, token: str, db: Session = Depends(get_db)):
    u = _unit_by_token(db, token)
    c = db.get(Customer, u.customer_id)
    open_t = db.execute(select(Ticket).where(Ticket.stock_unit_id == u.id,
                                             Ticket.status.notin_(("resolved", "closed")))).scalar_one_or_none()
    return {"company": get_setting(db, "company_name"), "product": u.product.name, "brand": u.product.brand,
            "category": u.product.category, "serial_no": u.serial_no, "installed_on": u.delivered_at,
            "warranty_end": u.warranty_end, "in_warranty": bool(u.warranty_end and date.today() <= u.warranty_end),
            "owner": reports.mask_name(c.name), "city": c.city,
            "open_ticket": {"number": open_t.number, "status": open_t.status, "due_by": open_t.due_by} if open_t else None}


@public.post("/units/{token}/tickets", status_code=201)
@limiter.limit("3/minute")
def public_ticket(request: Request, token: str, data: PublicTicketIn, db: Session = Depends(get_db)):
    u = _unit_by_token(db, token)
    t = support.open_ticket(db, TicketIn(channel="qr", issue=data.issue, fault_code=data.fault_code), None, unit=u)
    return {"number": t.number, "in_warranty": t.in_warranty, "due_by": t.due_by,
            "message": "Complaint registered. A technician will be assigned shortly."}


@public.get("/units/{token}/qr.png")
def unit_qr(token: str, db: Session = Depends(get_db)):
    u = db.execute(select(StockUnit).where(StockUnit.qr_token == token)).scalar_one_or_none()
    if not u:
        raise AppError("UNIT_NOT_FOUND", "Unknown QR token.", 404)
    img = qrcode.make(f"{settings.public_base_url}/u/{token}", box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png", headers={"Cache-Control": "public, max-age=86400"})


@public.get("/track/{code}")
@limiter.limit("30/minute")
def track(request: Request, code: str, db: Session = Depends(get_db)):
    from app.services.tracking import public_track
    return public_track(db, code)


@public.get("/shared/{token}")
@limiter.limit("30/minute")
def shared(request: Request, token: str, db: Session = Depends(get_db)):
    return reports.view_shared(db, token, request.client.host if request.client else None)