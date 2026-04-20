# backend/routes/trial.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from backend.deps import get_db, get_current_user
from backend.models import User

router = APIRouter(prefix="/api/v1/trial", tags=["trial"])

TRIAL_DAYS = 7        # set to None if you prefer run-credits
TRIAL_RUNS = None     # e.g., 20 if doing credit-based trial

@router.post("/start")
def start_trial(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """One-time app-level trial: start 7-day window or assign runs."""
    if user.trial_used:
        raise HTTPException(400, "Trial already used.")
    user.trial_used = True
    now = datetime.now(timezone.utc)
    if TRIAL_DAYS:
        user.trial_started_at = now
        user.trial_expires_at = now + timedelta(days=TRIAL_DAYS)
    if TRIAL_RUNS is not None:
        user.trial_runs_left = TRIAL_RUNS
    db.add(user); db.commit(); db.refresh(user)
    return {
        "ok": True,
        "expires_at": user.trial_expires_at,
        "runs_left": user.trial_runs_left,
    }
