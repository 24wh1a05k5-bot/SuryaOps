"""Purchases, stock, dispatch, installation jobs, subsidy tracker."""
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.core.db import get_db
from app.core.deps import require_roles
from app.models import Customer, Job, Order, PickList, Purchase, StockUnit, SubsidyCase, SubsidyEvent, User
from app.schemas.inputs import (JobCompleteIn, JobSerialsIn, JobStartIn, PurchaseIn, ReceiveIn, ScanIn, ScheduleIn,
                                SubsidyAdvanceIn)
from app.services import field, stock
from app.services.common import get_setting, paginate
from app.services.sales import get_order
from app.services.serializers import job_out, order_out, photo_out, purchase_out, subsidy_out, unit_out, user_brief

router = APIRouter()
WH = require_roles("warehouse")
STOCK_READ = require_roles("warehouse", "sales", "support", "accounts")


# ----- purchases -----

@router.get("/purchases")
def list_purchases(page: int = 1, page_size: int = 25, status: str | None = None, db: Session = Depends(get_db),
                   _: User = Depends(STOCK_READ)):
    stmt = select(Purchase).options(joinedload(Purchase.supplier)).order_by(Purchase.created_at.desc())
    if status:
        stmt = stmt.where(Purchase.status.in_(status.split(",")))
    return paginate(db, stmt, page, page_size, purchase_out)


@router.post("/purchases", status_code=201)
def create_purchase(data: PurchaseIn, db: Session = Depends(get_db), user: User = Depends(WH)):
    return purchase_out(stock.create_purchase(db, data, user), detail=True)


@router.get("/purchases/{purchase_id}")
def get_purchase(purchase_id: int, db: Session = Depends(get_db), _: User = Depends(STOCK_READ)):
    p = stock.get_purchase(db, purchase_id)
    data = purchase_out(p, detail=True)
    units = db.execute(select(StockUnit).where(StockUnit.purchase_line_id.in_([ln.id for ln in p.lines]))).scalars().all()
    data["units"] = [{"serial_no": u.serial_no, "line_id": u.purchase_line_id, "status": u.status} for u in units]
    return data


@router.post("/purchases/{purchase_id}/order")
def order_purchase(purchase_id: int, db: Session = Depends(get_db), user: User = Depends(WH)):
    return purchase_out(stock.mark_ordered(db, purchase_id, user))


@router.post("/purchases/{purchase_id}/receive")
def receive(purchase_id: int, data: ReceiveIn, db: Session = Depends(get_db), user: User = Depends(WH)):
    return purchase_out(stock.receive_purchase(db, purchase_id, data, user), detail=True)


# ----- stock -----

@router.get("/stock/summary")
def summary(db: Session = Depends(get_db), _: User = Depends(STOCK_READ)):
    return stock.stock_summary(db)


@router.get("/stock/units")
def units(page: int = 1, page_size: int = 25, serial: str | None = None, status: str | None = None,
          product_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(STOCK_READ)):
    stmt = select(StockUnit).options(joinedload(StockUnit.product)).order_by(StockUnit.id.desc())
    if serial:
        stmt = stmt.where(StockUnit.serial_no.ilike(f"%{serial.strip()}%"))
    if status:
        stmt = stmt.where(StockUnit.status.in_(status.split(",")))
    if product_id:
        stmt = stmt.where(StockUnit.product_id == product_id)
    customers = {}

    def ser(u: StockUnit):
        d = unit_out(u)
        if u.customer_id:
            c = customers.get(u.customer_id) or db.get(Customer, u.customer_id)
            customers[u.customer_id] = c
            d["customer"] = {"id": c.id, "name": c.name, "phone": c.phone}
        return d
    return paginate(db, stmt, page, page_size, ser)


# ----- dispatch -----

@router.get("/pick-lists")
def pick_lists(status: str | None = None, db: Session = Depends(get_db), _: User = Depends(STOCK_READ)):
    stmt = select(PickList).join(Order).order_by(PickList.created_at.desc())
    if status:
        stmt = stmt.where(PickList.status.in_(status.split(",")))
    out = []
    for pl in db.execute(stmt.limit(100)).scalars():
        o = get_order(db, pl.order_id)
        prog = stock.pick_progress(db, o)
        out.append({"id": pl.id, "status": pl.status, "order": order_out(o), "created_at": pl.created_at,
                    "items": sum(r["qty"] for r in prog), "scanned": sum(r["scanned"] for r in prog)})
    return out


@router.get("/pick-lists/{pick_id}")
def pick_list(pick_id: int, db: Session = Depends(get_db), _: User = Depends(STOCK_READ)):
    pl = stock.get_pick_list(db, pick_id)
    o = get_order(db, pl.order_id)
    reserved = db.execute(select(StockUnit).where(StockUnit.order_id == o.id).order_by(StockUnit.id)).scalars().all()
    return {"id": pl.id, "status": pl.status, "order": order_out(o), "progress": stock.pick_progress(db, o),
            "reserved_units": [{"serial_no": u.serial_no, "product": u.product.name, "scanned": u.scanned_at is not None}
                               for u in reserved]}


@router.post("/pick-lists/{pick_id}/scan")
def scan(pick_id: int, data: ScanIn, db: Session = Depends(get_db), user: User = Depends(WH)):
    return stock.scan_serial(db, pick_id, data.serial, user)


@router.post("/pick-lists/{pick_id}/unscan")
def unscan(pick_id: int, data: ScanIn, db: Session = Depends(get_db), user: User = Depends(WH)):
    return stock.unscan_serial(db, pick_id, data.serial, user)


@router.post("/pick-lists/{pick_id}/dispatch")
def do_dispatch(pick_id: int, db: Session = Depends(get_db), user: User = Depends(WH)):
    return order_out(stock.dispatch(db, pick_id, user))


@router.post("/orders/{order_id}/deliver")
def deliver(order_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("warehouse", "technician"))):
    return order_out(stock.deliver(db, order_id, user))


# ----- jobs -----

def _job_detail(db: Session, job: Job):
    tech = db.get(User, job.technician_id) if job.technician_id else None
    data = job_out(job, tech)
    data["photos"] = [photo_out(p) for p in field.photos_for(db, "job", job.id)]
    data["serials"] = field.job_serials(db, job)["expected"]
    order = get_order(db, job.order_id)
    data["order"] = order_out(order, detail=True)
    case = field.subsidy_case_for_order(db, order.id)
    data["subsidy_stage"] = case.stage if case else None
    return data


@router.get("/jobs")
def list_jobs(page: int = 1, page_size: int = 25, status: str | None = None, technician: str | None = None,
              db: Session = Depends(get_db), user: User = Depends(require_roles("technician", "sales", "warehouse"))):
    stmt = select(Job).join(Order).join(Customer).options(joinedload(Job.order).joinedload(Order.customer))
    if user.role == "technician" or technician == "me":
        stmt = stmt.where(Job.technician_id == user.id)
    elif technician:
        stmt = stmt.where(Job.technician_id == int(technician))
    if status:
        stmt = stmt.where(Job.status.in_(status.split(",")))
    stmt = stmt.order_by(Job.scheduled_start.asc().nulls_first(), Job.id.desc())
    techs = {u.id: u for u in db.execute(select(User).where(User.role == "technician")).scalars()}
    return paginate(db, stmt, page, page_size, lambda j: job_out(j, techs.get(j.technician_id)))


@router.get("/jobs/{job_id}")
def get_job(job_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("technician", "sales", "warehouse"))):
    job = field.get_job(db, job_id)
    field._assert_tech_access(job, user)
    return _job_detail(db, job)


@router.post("/jobs/{job_id}/schedule")
def schedule(job_id: int, data: ScheduleIn, db: Session = Depends(get_db), user: User = Depends(require_roles("sales"))):
    return _job_detail(db, field.schedule_job(db, job_id, data, user))


@router.post("/jobs/{job_id}/start")
def start(job_id: int, data: JobStartIn | None = None, db: Session = Depends(get_db),
          user: User = Depends(require_roles("technician"))):
    return _job_detail(db, field.start_job(db, job_id, user, data.actual_start if data else None))


@router.post("/jobs/{job_id}/serials")
def serials(job_id: int, data: JobSerialsIn, db: Session = Depends(get_db),
            user: User = Depends(require_roles("technician"))):
    field.link_serials(db, job_id, data.serials, user)
    return _job_detail(db, field.get_job(db, job_id))


@router.post("/jobs/{job_id}/photos", status_code=201)
async def upload_job_photo(job_id: int, kind: str = Form(...), lat: float | None = Form(default=None),
                           lng: float | None = Form(default=None), taken_at: datetime | None = Form(default=None),
                           file: UploadFile = File(...), db: Session = Depends(get_db),
                           user: User = Depends(require_roles("technician"))):
    from app.core.errors import AppError
    from app.models.field import PHOTO_KINDS
    job = field.get_job(db, job_id)
    field._assert_tech_access(job, user)
    if kind not in PHOTO_KINDS:
        raise AppError("INVALID_PHOTO_KIND", "Unknown photo type.")
    content = await file.read()
    return photo_out(field.add_photo(db, "job", job.id, kind, content, file.content_type, lat, lng, taken_at))


@router.post("/jobs/{job_id}/complete")
def complete(job_id: int, data: JobCompleteIn, db: Session = Depends(get_db),
             user: User = Depends(require_roles("technician"))):
    return _job_detail(db, field.complete_job(db, job_id, data, user))


# ----- subsidy -----

@router.get("/subsidy")
def subsidy_board(db: Session = Depends(get_db), _: User = Depends(require_roles("sales", "accounts"))):
    sla = int(get_setting(db, "subsidy_stage_sla_days") or 30)
    cases = db.execute(select(SubsidyCase).options(joinedload(SubsidyCase.order).joinedload(Order.customer))
                       .order_by(SubsidyCase.stage_entered_at)).scalars().all()
    return {"sla_days": sla, "cases": [subsidy_out(c, sla) for c in cases]}


@router.get("/subsidy/{case_id}")
def subsidy_case(case_id: int, db: Session = Depends(get_db), _: User = Depends(require_roles("sales", "accounts"))):
    sla = int(get_setting(db, "subsidy_stage_sla_days") or 30)
    c = field.get_case(db, case_id)
    events = db.execute(select(SubsidyEvent, User.name).outerjoin(User, User.id == SubsidyEvent.user_id)
                        .where(SubsidyEvent.case_id == c.id).order_by(SubsidyEvent.id)).all()
    return {**subsidy_out(c, sla), "checklist": field.inspection_checklist(db, c),
            "events": [{"from": e.from_stage, "to": e.to_stage, "note": e.note, "user": n, "at": e.created_at}
                       for e, n in events]}


@router.get("/subsidy/{case_id}/checklist")
def checklist(case_id: int, db: Session = Depends(get_db), _: User = Depends(require_roles("sales", "accounts"))):
    return field.inspection_checklist(db, field.get_case(db, case_id))


@router.post("/subsidy/{case_id}/advance")
def advance(case_id: int, data: SubsidyAdvanceIn, db: Session = Depends(get_db), user: User = Depends(require_roles("sales"))):
    sla = int(get_setting(db, "subsidy_stage_sla_days") or 30)
    return subsidy_out(field.advance_case(db, case_id, data, user), sla)


@router.post("/subsidy/{case_id}/submit-inspection")
def submit_inspection(case_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles("sales"))):
    sla = int(get_setting(db, "subsidy_stage_sla_days") or 30)
    return subsidy_out(field.submit_inspection(db, case_id, user), sla)
