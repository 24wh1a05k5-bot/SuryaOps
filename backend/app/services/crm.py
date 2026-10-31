"""Leads, qualification and site surveys (spec 6.1, 6.2)."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.models import Customer, Lead, LeadNote, Survey, User
from app.schemas.inputs import (LeadIn, LeadTransitionIn, LeadUpdate, PublicLeadIn, SurveyCreate,
                                SurveySubmit)
from app.services.common import log_activity, normalize_name, now


def check_version(obj, version: int | None):
    if version is not None and version != obj.version:
        raise AppError("STALE_VERSION", "This record was updated by someone else. Refresh to see the latest.",
                       409, {"current_version": obj.version})


def get_lead(db: Session, lead_id: int, lock: bool = False) -> Lead:
    stmt = select(Lead).where(Lead.id == lead_id).execution_options(populate_existing=True)
    if lock:
        stmt = stmt.with_for_update()
    lead = db.execute(stmt).scalar_one_or_none()
    if not lead:
        raise not_found("Lead", lead_id)
    return lead


def create_lead(db: Session, data: PublicLeadIn | LeadIn, user: User | None, source: str = "web") -> tuple[Lead, bool]:
    """R-CRM-1: phone is unique; a repeat enquiry attaches to the existing customer."""
    customer = db.execute(select(Customer).where(Customer.phone == data.phone).with_for_update()).scalar_one_or_none()
    returning = customer is not None
    if not customer:
        customer = Customer(name=data.name, phone=data.phone, email=data.email, address=data.address,
                            city=data.city, pincode=data.pincode, monthly_bill=data.monthly_bill)
        db.add(customer)
        db.flush()
    elif data.monthly_bill is not None and customer.monthly_bill is None:
        customer.monthly_bill = data.monthly_bill
    lead = Lead(customer_id=customer.id, source=getattr(data, "source", source), requested_kw=data.requested_kw,
                system_type=data.system_type, wants_subsidy=data.wants_subsidy,
                assigned_to=getattr(data, "assigned_to", None), status="new", last_activity_at=now())
    db.add(lead)
    db.flush()
    log_activity(db, user.id if user else None, "lead", lead.id, "created",
                 {"source": lead.source, "returning_customer": returning})
    db.commit()
    return lead, returning


def update_lead(db: Session, lead_id: int, data: LeadUpdate, user: User) -> Lead:
    lead = get_lead(db, lead_id, lock=True)
    check_version(lead, data.version)
    if lead.status in ("won", "lost"):
        raise AppError("LEAD_CLOSED", "This lead is closed and can't be edited.")
    values = data.model_dump(exclude_unset=True, exclude={"version"})
    customer_fields = {"monthly_bill", "consumer_no", "aadhaar_name", "bill_name", "bank_account_name",
                       "bank_aadhaar_seeded", "address", "city"}
    for key, val in values.items():
        target = lead.customer if key in customer_fields else lead
        setattr(target, key, val)
    lead.last_activity_at = now()
    log_activity(db, user.id, "lead", lead.id, "updated", {"fields": sorted(values)})
    db.commit()
    return lead


def subsidy_readiness(customer: Customer) -> dict:
    """R-CRM-3: names on Aadhaar / electricity bill / bank must match, bank must be Aadhaar-seeded."""
    names = [customer.aadhaar_name, customer.bill_name, customer.bank_account_name]
    missing = [label for label, n in zip(("Aadhaar name", "Electricity bill name", "Bank account name"), names)
               if not n]
    normalized = {normalize_name(n) for n in names if n}
    issues = []
    if missing:
        issues.append(f"Missing: {', '.join(missing)}")
    if len(normalized) > 1:
        issues.append("Names don't match across Aadhaar, electricity bill and bank account")
    if not customer.bank_aadhaar_seeded:
        issues.append("Bank account not confirmed as Aadhaar-seeded (subsidy is paid by DBT)")
    return {"ready": not issues, "issues": issues}


def transition_lead(db: Session, lead_id: int, data: LeadTransitionIn, user: User) -> Lead:
    lead = get_lead(db, lead_id, lock=True)
    if lead.status in ("won", "lost"):
        raise AppError("LEAD_CLOSED", "This lead is already closed.")
    if data.to == "contacted":
        if lead.status != "new":
            raise AppError("INVALID_TRANSITION", "Only new leads can be marked as contacted.")
    elif data.to == "qualified":
        if lead.status not in ("new", "contacted"):
            raise AppError("INVALID_TRANSITION", "This lead is already past qualification.")
        missing = [label for label, v in (("roof area", lead.roof_area_sqft), ("shadow-free roof", lead.shadow_free),
                                          ("grid suitability", lead.grid_suitable),
                                          ("monthly bill", lead.customer.monthly_bill)) if v is None]
        if missing:
            raise AppError("QUALIFICATION_INCOMPLETE",
                           f"Fill in {', '.join(missing)} before qualifying this lead.", 400, {"missing": missing})
        if lead.shadow_free is False or lead.grid_suitable is False:
            raise AppError("NOT_SUITABLE", "The roof or grid connection was marked unsuitable. Mark the lead lost "
                                           "or update the qualification.")
    elif data.to == "lost":
        if not data.lost_reason:
            raise AppError("LOST_REASON_REQUIRED", "Please give a reason for losing this lead.")  # R-CRM-4
        lead.lost_reason = data.lost_reason
    old = lead.status
    lead.status = data.to
    lead.last_activity_at = now()
    log_activity(db, user.id, "lead", lead.id, "status_changed", {"from": old, "to": data.to})
    db.commit()
    return lead


def add_note(db: Session, lead_id: int, note: str, user: User) -> LeadNote:
    lead = get_lead(db, lead_id)
    n = LeadNote(lead_id=lead.id, user_id=user.id, note=note)
    lead.last_activity_at = now()
    db.add(n)
    db.commit()
    return n


# ----- Surveys -----

def schedule_survey(db: Session, lead_id: int, data: SurveyCreate, user: User) -> Survey:
    lead = get_lead(db, lead_id, lock=True)
    if lead.status not in ("qualified", "survey_scheduled"):
        raise AppError("LEAD_NOT_QUALIFIED", "Qualify the lead before scheduling a site survey.")
    tech = db.get(User, data.technician_id)
    if not tech or tech.role != "technician" or not tech.is_active:
        raise AppError("INVALID_TECHNICIAN", "Choose an active technician for the survey.")
    open_survey = db.execute(select(Survey).where(Survey.lead_id == lead.id,
                                                  Survey.status.in_(("scheduled", "submitted")))).scalars().first()
    if open_survey:
        raise AppError("SURVEY_ALREADY_OPEN", "This lead already has a survey in progress.", 409,
                       {"survey_id": open_survey.id})
    survey = Survey(lead_id=lead.id, technician_id=tech.id, scheduled_at=data.scheduled_at, status="scheduled")
    db.add(survey)
    lead.status = "survey_scheduled"
    lead.last_activity_at = now()
    db.flush()
    log_activity(db, user.id, "lead", lead.id, "survey_scheduled", {"survey_id": survey.id, "technician": tech.name})
    db.commit()
    return survey


def get_survey(db: Session, survey_id: int, lock: bool = False) -> Survey:
    stmt = select(Survey).where(Survey.id == survey_id)
    if lock:
        stmt = stmt.with_for_update()
    s = db.execute(stmt).scalar_one_or_none()
    if not s:
        raise not_found("Survey", survey_id)
    return s


def submit_survey(db: Session, survey_id: int, data: SurveySubmit, user: User) -> Survey:
    s = get_survey(db, survey_id, lock=True)
    if user.role != "admin" and s.technician_id != user.id:
        raise AppError("FORBIDDEN", "Only the assigned technician can submit this survey.", 403)  # R-SUR-1
    if s.status not in ("scheduled", "rejected"):
        raise AppError("INVALID_TRANSITION", "This survey has already been submitted.")
    for k, v in data.model_dump().items():
        setattr(s, k, v)
    s.status = "submitted"
    s.submitted_at = now()
    log_activity(db, user.id, "lead", s.lead_id, "survey_submitted", {"survey_id": s.id})
    db.commit()
    return s


def review_survey(db: Session, survey_id: int, approve: bool, user: User, reason: str | None = None) -> Survey:
    s = get_survey(db, survey_id, lock=True)
    if s.status != "submitted":
        raise AppError("INVALID_TRANSITION", "Only submitted surveys can be reviewed.")
    s.reviewed_by = user.id
    s.reviewed_at = now()
    lead = get_lead(db, s.lead_id, lock=True)
    if approve:
        s.status = "approved"
        lead.status = "survey_approved"  # R-SUR-4
    else:
        s.status = "rejected"
        s.rejection_reason = reason  # R-SUR-3
    lead.last_activity_at = now()
    log_activity(db, user.id, "lead", lead.id, "survey_approved" if approve else "survey_rejected",
                 {"survey_id": s.id, "reason": reason})
    db.commit()
    return s
