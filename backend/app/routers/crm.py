"""Customers, leads, surveys."""
from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload, selectinload

from app.core.db import get_db
from app.core.deps import get_current_user, require_roles
from app.core.errors import not_found
from app.models import Customer, Lead, Survey, User
from app.schemas.inputs import LeadIn, LeadTransitionIn, LeadUpdate, NoteIn, RejectIn, SurveyCreate, SurveySubmit
from app.services import crm
from app.services.common import paginate
from app.services.serializers import customer_out, lead_out, survey_out, user_brief

router = APIRouter()
SALES = require_roles("sales")


@router.get("/customers")
def list_customers(page: int = 1, page_size: int = 25, q: str | None = None, db: Session = Depends(get_db),
                   _: User = Depends(get_current_user)):
    stmt = select(Customer).order_by(Customer.created_at.desc())
    if q:
        stmt = stmt.where(or_(Customer.name.ilike(f"%{q}%"), Customer.phone.like(f"%{q}%")))
    return paginate(db, stmt, page, page_size, customer_out)


@router.get("/customers/{customer_id}")
def get_customer(customer_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    c = db.get(Customer, customer_id)
    if not c:
        raise not_found("Customer", customer_id)
    return {**customer_out(c), "readiness": crm.subsidy_readiness(c)}


@router.get("/leads")
def list_leads(page: int = 1, page_size: int = 25, q: str | None = None, status: str | None = None,
               source: str | None = None, sort: str = "-created_at", db: Session = Depends(get_db),
               _: User = Depends(require_roles("sales", "support"))):
    stmt = select(Lead).join(Customer).options(joinedload(Lead.customer))
    if q:
        stmt = stmt.where(or_(Customer.name.ilike(f"%{q}%"), Customer.phone.like(f"%{q}%"),
                              Customer.city.ilike(f"%{q}%")))
    if status:
        stmt = stmt.where(Lead.status.in_(status.split(",")))
    if source:
        stmt = stmt.where(Lead.source == source)
    col = {"created_at": Lead.created_at, "requested_kw": Lead.requested_kw, "name": Customer.name,
           "status": Lead.status}.get(sort.lstrip("-"), Lead.created_at)
    stmt = stmt.order_by(col.desc() if sort.startswith("-") else col.asc(), Lead.id.desc())
    return paginate(db, stmt, page, page_size, lead_out)


@router.post("/leads", status_code=201)
def create_lead(data: LeadIn, db: Session = Depends(get_db), user: User = Depends(SALES)):
    lead, returning = crm.create_lead(db, data, user, source=data.source)
    return {**lead_out(lead), "returning_customer": returning}


@router.get("/leads/{lead_id}")
def get_lead(lead_id: int, db: Session = Depends(get_db), _: User = Depends(require_roles("sales", "support"))):
    lead = crm.get_lead(db, lead_id)
    data = lead_out(lead, detail=True)
    data["readiness"] = crm.subsidy_readiness(lead.customer)
    from app.models import LeadNote, Order
    notes = db.execute(select(LeadNote, User.name).outerjoin(User, User.id == LeadNote.user_id)
                       .where(LeadNote.lead_id == lead.id).order_by(LeadNote.id.desc())).all()
    data["notes"] = [{"id": n.id, "note": n.note, "user": name, "created_at": n.created_at} for n, name in notes]
    orders = db.execute(select(Order).where(Order.lead_id == lead.id).order_by(Order.id.desc())).scalars().all()
    data["orders"] = [{"id": o.id, "number": o.number, "status": o.status, "total": float(o.total)} for o in orders]
    other = db.execute(select(Lead.id).where(Lead.customer_id == lead.customer_id, Lead.id != lead.id)).scalars().all()
    data["returning_customer"] = bool(other)
    return data


@router.patch("/leads/{lead_id}")
def patch_lead(lead_id: int, data: LeadUpdate, db: Session = Depends(get_db), user: User = Depends(SALES)):
    return lead_out(crm.update_lead(db, lead_id, data, user), detail=True)


@router.post("/leads/{lead_id}/transition")
def transition(lead_id: int, data: LeadTransitionIn, db: Session = Depends(get_db), user: User = Depends(SALES)):
    return lead_out(crm.transition_lead(db, lead_id, data, user), detail=True)


@router.post("/leads/{lead_id}/notes", status_code=201)
def add_note(lead_id: int, data: NoteIn, db: Session = Depends(get_db), user: User = Depends(SALES)):
    n = crm.add_note(db, lead_id, data.note, user)
    return {"id": n.id, "note": n.note, "user": user.name, "created_at": n.created_at}


@router.post("/leads/{lead_id}/surveys", status_code=201)
def schedule_survey(lead_id: int, data: SurveyCreate, db: Session = Depends(get_db), user: User = Depends(SALES)):
    return survey_out(crm.schedule_survey(db, lead_id, data, user))


@router.get("/surveys")
def list_surveys(page: int = 1, page_size: int = 25, status: str | None = None, mine: bool = False,
                 db: Session = Depends(get_db), user: User = Depends(require_roles("sales", "technician"))):
    stmt = select(Survey).options(selectinload(Survey.lead).joinedload(Lead.customer)).order_by(Survey.scheduled_at.desc())
    if user.role == "technician" or mine:
        stmt = stmt.where(Survey.technician_id == user.id)
    if status:
        stmt = stmt.where(Survey.status.in_(status.split(",")))
    techs = {u.id: u for u in db.execute(select(User).where(User.role == "technician")).scalars()}

    def ser(s: Survey):
        return {**survey_out(s), "customer": customer_out(s.lead.customer), "requested_kw": float(s.lead.requested_kw),
                "system_type": s.lead.system_type, "technician": user_brief(techs.get(s.technician_id))}
    return paginate(db, stmt, page, page_size, ser)


@router.post("/surveys/{survey_id}/submit")
def submit_survey(survey_id: int, data: SurveySubmit, db: Session = Depends(get_db),
                  user: User = Depends(require_roles("technician"))):
    return survey_out(crm.submit_survey(db, survey_id, data, user))


@router.post("/surveys/{survey_id}/approve")
def approve_survey(survey_id: int, db: Session = Depends(get_db), user: User = Depends(SALES)):
    return survey_out(crm.review_survey(db, survey_id, True, user))


@router.post("/surveys/{survey_id}/reject")
def reject_survey(survey_id: int, data: RejectIn, db: Session = Depends(get_db), user: User = Depends(SALES)):
    return survey_out(crm.review_survey(db, survey_id, False, user, data.reason))
