"""Auth, users, settings, activity timeline, global search, health, demo reset."""
import subprocess
import sys
import threading
from pathlib import Path

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user, require_roles
from app.core.errors import AppError
from app.core.ratelimit import limiter
from app.core.security import create_access_token, verify_password
from app.models import ActivityLog, Setting, User
from app.schemas.inputs import LoginIn, SettingsUpdate
from app.services.common import DEFAULT_SETTINGS, get_setting
from app.services.reports import search
from app.services.serializers import user_out

router = APIRouter()


@router.post("/auth/login")
@limiter.limit("10/minute")
def login(request: Request, data: LoginIn, db: Session = Depends(get_db)):
    user = db.execute(select(User).where(User.email == data.email.lower())).scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise AppError("INVALID_CREDENTIALS", "Email or password is incorrect.", 401)
    if not user.is_active:
        raise AppError("ACCOUNT_DISABLED", "This account is disabled.", 403)
    return {"access_token": create_access_token(user.id, user.role), "user": user_out(user)}


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


@router.get("/users")
def users(role: str | None = None, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = select(User).where(User.is_active.is_(True)).order_by(User.name)
    if role:
        stmt = stmt.where(User.role == role)
    return [user_out(u) for u in db.execute(stmt).scalars()]


@router.get("/settings")
def get_settings(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return {k: get_setting(db, k) for k in DEFAULT_SETTINGS}


@router.patch("/settings")
def patch_settings(data: SettingsUpdate, db: Session = Depends(get_db), _: User = Depends(require_roles())):
    for key, value in data.values.items():
        if key not in DEFAULT_SETTINGS:
            raise AppError("UNKNOWN_SETTING", f"Unknown setting '{key}'.")
        row = db.get(Setting, key)
        if row:
            row.value = value
        else:
            db.add(Setting(key=key, value=value))
    db.commit()
    return {k: get_setting(db, k) for k in DEFAULT_SETTINGS}


@router.get("/activity")
def activity(entity: str, entity_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    rows = db.execute(select(ActivityLog, User.name).outerjoin(User, User.id == ActivityLog.user_id)
                      .where(ActivityLog.entity == entity, ActivityLog.entity_id == entity_id)
                      .order_by(ActivityLog.created_at.desc()).limit(100)).all()
    return [{"id": a.id, "action": a.action, "details": a.details, "user": name or "System",
             "created_at": a.created_at} for a, name in rows]


@router.get("/search")
def global_search(q: str = Query(min_length=1, max_length=80), db: Session = Depends(get_db),
                  _: User = Depends(get_current_user)):
    return search(db, q)


_reset_lock = threading.Lock()
BACKEND_DIR = Path(__file__).resolve().parents[2]


@router.post("/admin/reset-demo")
def reset_demo(db: Session = Depends(get_db), _: User = Depends(require_roles())):
    """Director only: rebuild the demo data, exactly like `python -m app.seed.seed --reset`.
    Runs as a separate process because the seed script moves the clock back in time while it works."""
    if not _reset_lock.acquire(blocking=False):
        raise AppError("RESET_IN_PROGRESS", "A reset is already running. Give it a few seconds.", 409)
    try:
        from app.core.db import engine
        from app.services import reports
        db.rollback()      # end this request's own transaction: it holds a lock on the users table
        db.close()
        engine.dispose()  # release pooled connections so the tables can be dropped
        r = subprocess.run([sys.executable, "-m", "app.seed.seed", "--reset"], cwd=BACKEND_DIR,
                           capture_output=True, text=True, timeout=240)
        engine.dispose()  # fresh connections: old ones remember the dropped tables
        reports._cache.clear()
        if r.returncode != 0:
            raise AppError("RESET_FAILED", "The demo data couldn't be rebuilt. Check the server logs.", 500,
                           {"output": (r.stderr or r.stdout)[-800:]})
        return {"ok": True, "message": "Demo data has been reset."}
    finally:
        _reset_lock.release()


@router.get("/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}