"""Installation jobs, photos, time logs and the subsidy tracker + inspection gate (spec 6.7, 6.9)."""
import base64
import io
import uuid
from datetime import datetime
from decimal import Decimal

from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError, not_found
from app.models import (SUBSIDY_STAGES, Job, JobSerial, Photo, StockUnit, SubsidyCase, SubsidyEvent, TimeLog,
                        User)
from app.schemas.inputs import JobCompleteIn, ScheduleIn, SubsidyAdvanceIn
from app.services.common import log_activity, now
from app.services.crm import subsidy_readiness
from app.services.sales import get_order

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


def get_job(db: Session, job_id: int, lock: bool = False) -> Job:
    stmt = select(Job).where(Job.id == job_id)
    if lock:
        stmt = stmt.with_for_update()
    job = db.execute(stmt).scalar_one_or_none()
    if not job:
        raise not_found("Job", job_id)
    return job


def _assert_tech_access(job: Job, user: User):
    if user.role == "technician" and job.technician_id != user.id:
        raise AppError("FORBIDDEN", "This job is assigned to another technician.", 403)


def schedule_job(db: Session, job_id: int, data: ScheduleIn, user: User) -> Job:
    """R-JOB-1: a technician can't be double-booked. Locking the technician row serialises bookings."""
    job = get_job(db, job_id, lock=True)
    if job.status not in ("unscheduled", "scheduled"):
        raise AppError("INVALID_TRANSITION", "Only unscheduled or scheduled jobs can be (re)scheduled.")
    if data.scheduled_end <= data.scheduled_start:
        raise AppError("INVALID_TIME_RANGE", "The job must end after it starts.")
    tech = db.execute(select(User).where(User.id == data.technician_id).with_for_update()).scalar_one_or_none()
    if not tech or tech.role != "technician" or not tech.is_active:
        raise AppError("INVALID_TECHNICIAN", "Choose an active technician.")
    clash = db.execute(select(Job).where(
        Job.technician_id == tech.id, Job.id != job.id, Job.status.in_(("scheduled", "in_progress")),
        Job.scheduled_start < data.scheduled_end, Job.scheduled_end > data.scheduled_start)).scalars().first()
    if clash:
        raise AppError("TECHNICIAN_DOUBLE_BOOKED",
                       f"{tech.name} already has job #{clash.id} at that time. Pick another slot or technician.",
                       409, {"job_id": clash.id})
    job.technician_id, job.scheduled_start, job.scheduled_end = tech.id, data.scheduled_start, data.scheduled_end
    job.status = "scheduled"
    log_activity(db, user.id, "job", job.id, "scheduled", {"technician": tech.name})
    db.commit()
    return job


def subsidy_case_for_order(db: Session, order_id: int) -> SubsidyCase | None:
    return db.execute(select(SubsidyCase).where(SubsidyCase.order_id == order_id)).scalar_one_or_none()


def start_job(db: Session, job_id: int, user: User, actual_start: datetime | None = None) -> Job:
    job = get_job(db, job_id, lock=True)
    _assert_tech_access(job, user)
    if job.status != "scheduled":
        raise AppError("INVALID_TRANSITION", "Schedule the job before starting it.")
    order = get_order(db, job.order_id)
    if order.status != "delivered":
        raise AppError("NOT_DELIVERED", "Materials haven't been delivered to site yet.")
    if order.is_subsidy:  # R-JOB-2: never install before DISCOM feasibility approval
        case = subsidy_case_for_order(db, order.id)
        if not case or SUBSIDY_STAGES.index(case.stage) < SUBSIDY_STAGES.index("feasibility_approved"):
            raise AppError("FEASIBILITY_NOT_APPROVED", "DISCOM feasibility isn't approved yet. Installing now would "
                                                       "make the subsidy claim invalid.", 400)
    job.actual_start = actual_start or now()
    job.status = "in_progress"
    log_activity(db, user.id, "job", job.id, "started")
    db.commit()
    return job


def link_serials(db: Session, job_id: int, serials: list[str], user: User) -> list[str]:
    job = get_job(db, job_id, lock=True)
    _assert_tech_access(job, user)
    if job.status != "in_progress":
        raise AppError("INVALID_TRANSITION", "Start the job before recording serials.")
    linked = []
    for raw in serials:
        s = raw.strip().upper()
        unit = db.execute(select(StockUnit).where(StockUnit.serial_no == s)).scalar_one_or_none()
        if not unit or unit.order_id != job.order_id:
            raise AppError("SERIAL_NOT_ON_ORDER", f"Serial {s} wasn't dispatched for this order.", 400)
        exists = db.execute(select(JobSerial).where(JobSerial.stock_unit_id == unit.id)).scalar_one_or_none()
        if not exists:
            db.add(JobSerial(job_id=job.id, stock_unit_id=unit.id))
        linked.append(s)
    db.commit()
    return linked


def job_serials(db: Session, job: Job) -> dict:
    units = db.execute(select(StockUnit).where(StockUnit.order_id == job.order_id)).scalars().all()
    linked_ids = set(db.execute(select(JobSerial.stock_unit_id).where(JobSerial.job_id == job.id)).scalars())
    return {"expected": [{"serial_no": u.serial_no, "product": u.product.name, "category": u.product.category,
                          "linked": u.id in linked_ids} for u in units]}


def save_upload(content: bytes, content_type: str) -> tuple[str, int]:
    """Validate, downscale to 1600px and store with a UUID name."""
    if content_type not in ALLOWED_TYPES:
        raise AppError("INVALID_FILE_TYPE", "Upload a JPEG, PNG or WebP image.", 400)
    if len(content) > settings.max_upload_mb * 1024 * 1024:
        raise AppError("FILE_TOO_LARGE", f"Images must be under {settings.max_upload_mb} MB.", 400)
    try:
        img = Image.open(io.BytesIO(content))
        img.thumbnail((1600, 1600))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, "JPEG", quality=82, optimize=True)
    except Exception:
        raise AppError("INVALID_IMAGE", "That file isn't a readable image.", 400)
    name = f"{uuid.uuid4().hex}.jpg"
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    (settings.upload_dir / name).write_bytes(buf.getvalue())
    return name, buf.tell()


def add_photo(db: Session, owner_type: str, owner_id: int, kind: str, content: bytes, content_type: str,
              lat: float | None, lng: float | None, taken_at: datetime | None) -> Photo:
    path, size = save_upload(content, content_type)
    photo = Photo(owner_type=owner_type, owner_id=owner_id, kind=kind, path=path,
                  lat=Decimal(str(lat)) if lat is not None else None,
                  lng=Decimal(str(lng)) if lng is not None else None, taken_at=taken_at or now(), size_bytes=size)
    db.add(photo)
    db.commit()
    return photo


def photos_for(db: Session, owner_type: str, owner_id: int) -> list[Photo]:
    return db.execute(select(Photo).where(Photo.owner_type == owner_type, Photo.owner_id == owner_id)
                      .order_by(Photo.id)).scalars().all()


def _save_signature(data_url: str) -> str:
    try:
        header, b64 = data_url.split(",", 1)
        raw = base64.b64decode(b64)
    except Exception:
        raise AppError("INVALID_SIGNATURE", "The signature couldn't be read. Please sign again.")
    name = f"sig_{uuid.uuid4().hex}.png"
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    (settings.upload_dir / name).write_bytes(raw)
    return name


def complete_job(db: Session, job_id: int, data: JobCompleteIn, user: User) -> Job:
    """R-JOB-3..5: valid times, kW within sanction, every serial linked, required photos, customer signature."""
    job = get_job(db, job_id, lock=True)
    _assert_tech_access(job, user)
    if job.status != "in_progress":
        raise AppError("INVALID_TRANSITION", "Only jobs in progress can be completed.")
    end = data.actual_end or now()
    if end <= job.actual_start:
        raise AppError("INVALID_TIME_RANGE", "Finish time must be after the start time.")
    order = get_order(db, job.order_id, lock=True)
    if order.is_subsidy and order.sanctioned_kw and Decimal(str(data.installed_kw)) > order.sanctioned_kw:
        raise AppError("CAPACITY_OVER_SANCTION", f"Installed {data.installed_kw} kW is more than the sanctioned "
                                                 f"{order.sanctioned_kw} kW. DISCOM will reject this.", 400)
    serials = job_serials(db, job)["expected"]
    missing = [s["serial_no"] for s in serials if not s["linked"]]
    if missing:
        raise AppError("SERIALS_NOT_RECORDED", f"Record every installed serial first ({len(missing)} missing).",
                       400, {"missing": missing})
    kinds = {p.kind for p in photos_for(db, "job", job.id)}
    need = [k for k in ("roof", "inverter_serial") if k not in kinds]
    if need:
        raise AppError("PHOTOS_MISSING", "Add the required photos: " + ", ".join(k.replace("_", " ") for k in need),
                       400, {"missing": need})
    job.signature_path = _save_signature(data.signature_data_url)
    job.signed_by_name = data.signed_by_name
    job.actual_end, job.installed_kw, job.notes = end, data.installed_kw, data.notes
    job.status, job.accepted_at = "customer_accepted", now()
    hours = Decimal(str(round((end - job.actual_start).total_seconds() / 3600, 2)))
    db.add(TimeLog(technician_id=job.technician_id, source_type="job", source_id=job.id,
                   started_at=job.actual_start, ended_at=end, hours=hours))
    for u in db.execute(select(StockUnit).where(StockUnit.order_id == order.id)).scalars():
        u.status = "installed"
    order.status, order.completed_at = "completed", now()
    if order.is_subsidy:
        case = subsidy_case_for_order(db, order.id)
        if case and case.stage == "feasibility_approved":
            _move_stage(db, case, "installed", user, "Installation completed and signed off")
    log_activity(db, user.id, "job", job.id, "completed", {"hours": float(hours)})
    db.commit()
    return job


# ----- Subsidy -----

def _move_stage(db: Session, case: SubsidyCase, to: str, user: User, note: str | None = None):
    db.add(SubsidyEvent(case_id=case.id, from_stage=case.stage, to_stage=to, user_id=user.id, note=note))
    case.stage, case.stage_entered_at = to, now()
    stamp = {"feasibility_approved": "feasibility_approved_at", "inspection_submitted": "inspection_submitted_at",
             "net_meter_installed": "net_meter_at", "subsidy_credited": "subsidy_credited_at"}.get(to)
    if stamp:
        setattr(case, stamp, now())


def get_case(db: Session, case_id: int, lock: bool = False) -> SubsidyCase:
    stmt = select(SubsidyCase).where(SubsidyCase.id == case_id)
    if lock:
        stmt = stmt.with_for_update()
    c = db.execute(stmt).scalar_one_or_none()
    if not c:
        raise not_found("Subsidy case", case_id)
    return c


def advance_case(db: Session, case_id: int, data: SubsidyAdvanceIn, user: User) -> SubsidyCase:
    case = get_case(db, case_id, lock=True)
    allowed = {"feasibility_approved": "applied", "net_meter_installed": "inspection_submitted",
               "subsidy_credited": "net_meter_installed"}
    if case.stage != allowed[data.to_stage]:
        raise AppError("INVALID_TRANSITION", f"A case at '{case.stage.replace('_', ' ')}' can't move to "
                                             f"'{data.to_stage.replace('_', ' ')}'.")
    if data.application_no:
        case.application_no = data.application_no
    if data.to_stage == "feasibility_approved" and not case.application_no:
        raise AppError("APPLICATION_NO_REQUIRED", "Enter the national portal application number first.")
    _move_stage(db, case, data.to_stage, user, data.note)
    log_activity(db, user.id, "order", case.order_id,
                 data.to_stage if data.to_stage.startswith("subsidy") else f"subsidy_{data.to_stage}")
    db.commit()
    return case


def inspection_checklist(db: Session, case: SubsidyCase) -> dict:
    """The compliance gate: every check that commonly causes DISCOM inspection rejection."""
    order = get_order(db, case.order_id)
    job = db.execute(select(Job).where(Job.order_id == order.id)).scalar_one_or_none()
    readiness = subsidy_readiness(order.customer)
    checks = []

    def add(key, label, ok, detail=None, fix=None):
        checks.append({"key": key, "label": label, "ok": bool(ok), "detail": detail, "fix": fix})

    add("names", "Names match on Aadhaar, bill and bank; bank Aadhaar-seeded", readiness["ready"],
        "; ".join(readiness["issues"]) or None, f"/leads/{order.lead_id}")
    non_dcr = [ln.product.name for ln in order.lines if ln.product.category == "panel" and not ln.product.is_dcr]
    add("dcr", "All panels are DCR (ALMM List-II)", not non_dcr, ", ".join(non_dcr) or None, f"/orders/{order.id}")
    if job:
        js = job_serials(db, job)["expected"]
        missing = [s["serial_no"] for s in js if not s["linked"]]
        has_inverter = any(s["category"] == "inverter" and s["linked"] for s in js)
        panels = [s for s in js if s["category"] == "panel"]
        add("serials", "Every panel serial and the inverter serial recorded",
            not missing and has_inverter and bool(panels),
            f"{len(missing)} serial(s) not recorded" if missing else None, f"/jobs/{job.id}")
        photos = photos_for(db, "job", job.id)
        kinds = {p.kind for p in photos}
        no_gps = [p for p in photos if p.lat is None or p.lng is None or p.taken_at is None]
        need = [k for k in ("roof", "inverter_serial") if k not in kinds]
        detail = []
        if need:
            detail.append("missing " + ", ".join(k.replace("_", " ") for k in need) + " photo")
        if no_gps:
            detail.append(f"{len(no_gps)} photo(s) without GPS/timestamp")
        add("photos", "Required photos present, each geo-tagged and timestamped", not need and not no_gps,
            "; ".join(detail) or None, f"/jobs/{job.id}")
        within = job.installed_kw is not None and order.sanctioned_kw is not None and \
            job.installed_kw <= order.sanctioned_kw
        add("capacity", "Installed capacity within sanctioned capacity", within,
            None if within else f"Installed {job.installed_kw or '—'} kW vs sanctioned {order.sanctioned_kw} kW",
            f"/jobs/{job.id}")
        order_ok = case.feasibility_approved_at is not None and job.actual_start is not None and \
            case.feasibility_approved_at <= job.actual_start
        add("sequence", "Feasibility approved before installation started", order_ok,
            None if order_ok else "Installation date is before feasibility approval or missing", None)
        add("signature", "Customer signed the installation report", job.signature_path is not None, None,
            f"/jobs/{job.id}")
    else:
        add("job", "Installation job exists", False, "No installation job on this order", f"/orders/{order.id}")
    return {"case_id": case.id, "ready": all(c["ok"] for c in checks), "checks": checks,
            "passed": sum(c["ok"] for c in checks), "total": len(checks)}


def submit_inspection(db: Session, case_id: int, user: User) -> SubsidyCase:
    case = get_case(db, case_id, lock=True)
    if case.stage != "installed":
        raise AppError("INVALID_TRANSITION", "Only installed systems can be submitted for inspection.")
    result = inspection_checklist(db, case)
    if not result["ready"]:
        failed = [c["label"] for c in result["checks"] if not c["ok"]]
        raise AppError("INSPECTION_NOT_READY", "Fix these before submitting: " + "; ".join(failed) + ".", 400,
                       {"checklist": result})
    _move_stage(db, case, "inspection_submitted", user, "All compliance checks passed")
    log_activity(db, user.id, "order", case.order_id, "subsidy_inspection_submitted")
    db.commit()
    return case
