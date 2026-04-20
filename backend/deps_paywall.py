# backend/deps_paywall.py
from fastapi import Depends, HTTPException
from backend.deps import get_current_user
from backend.models import User

PRO_OK = {"active", "trialing"}

def require_pro(user: User = Depends(get_current_user)) -> User:
    if user.subscription_status not in PRO_OK:
        raise HTTPException(status_code=402, detail="Upgrade required")
    return user

def require_pro_or_trial(user: User = Depends(get_current_user)) -> User:
    # Example if you also support a custom free trial window or runs
    if user.subscription_status in PRO_OK:
        return user
    # (Optionally inspect user.trial_used / trial_expires_at / trial_runs_left here)
    raise HTTPException(status_code=402, detail="Trial expired or upgrade required")
