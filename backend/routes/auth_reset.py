# backend/routes/auth_reset.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime, timedelta, timezone
import secrets
import hashlib
import os
import random
from typing import Dict, Any, Optional

from backend.utils.emailer import send_email
from backend.config import APP_BASE_URL
from backend.utils.users import get_user_by_email, set_user_password  # DB helpers

# NOTE:
# main.py mounts this router with prefix="/api/v1/auth" (keep this router un-prefixed)
router = APIRouter(tags=["Auth: Reset"])

# ===== Config / constants (env-tunable) =====
RESET_TOKEN_TTL_MIN = int(os.getenv("RESET_TOKEN_TTL_MIN", "30"))     # default 30 min
OTP_TTL_MIN = int(os.getenv("OTP_TTL_MIN", "10"))                      # default 10 min
OTP_MAX_ATTEMPTS = int(os.getenv("OTP_MAX_ATTEMPTS", "5"))             # default 5 attempts
RESET_TOKEN_BYTES = int(os.getenv("RESET_TOKEN_BYTES", "32"))          # token_urlsafe bytes
DEV_MODE = os.getenv("ENV", "dev").lower() in {"dev", "local"}

# ===== In-memory stores for reset link tokens and OTP (dev/demo only) =====
# token_hash -> {email, expires_at, used}
RESET_TOKENS: Dict[str, Dict[str, Any]] = {}
# email -> { code, expires_at, attempts }
OTP_STORE: Dict[str, Dict[str, Any]] = {}

# ===== Schemas =====
class ForgotReq(BaseModel):
    email: EmailStr = Field(..., description="User email to receive reset link")

class ResetReq(BaseModel):
    token: str = Field(..., min_length=10, description="Raw token from reset link")
    new_password: str = Field(..., min_length=8, description="New password")

class ForgotOtpIn(BaseModel):
    email: EmailStr

class VerifyOtpIn(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)

class ResetWithOtpIn(VerifyOtpIn):
    newPassword: str = Field(..., min_length=8)

# ===== Helpers (link flow) =====
def _make_reset_link(raw_token: str) -> str:
    base = APP_BASE_URL.rstrip("/")
    # Frontend page expected to read ?token=<raw>
    return f"{base}/reset-password?token={raw_token}"

def _store_token(email: str) -> str:
    raw = secrets.token_urlsafe(RESET_TOKEN_BYTES)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    RESET_TOKENS[token_hash] = {
        "email": email.lower(),
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MIN),
        "used": False,
    }
    return raw

def _lookup_token(raw_token: str):
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    return token_hash, RESET_TOKENS.get(token_hash)

def _gc_reset_tokens() -> None:
    """Remove expired tokens from memory (best-effort)."""
    now = datetime.now(timezone.utc)
    expired = [k for k, v in RESET_TOKENS.items() if v.get("expires_at") and v["expires_at"] < now]
    for k in expired:
        RESET_TOKENS.pop(k, None)

# ===== Helpers (OTP flow) =====
def _issue_otp(email: str) -> str:
    code = f"{random.randint(0, 999999):06d}"
    OTP_STORE[email] = {
        "code": code,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MIN),
        "attempts": 0,
    }
    return code

def _check_otp(email: str, code: str) -> None:
    rec = OTP_STORE.get(email)
    if not rec:
        raise HTTPException(status_code=400, detail="No OTP pending for this email.")
    if rec["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="OTP expired.")
    if rec["attempts"] >= OTP_MAX_ATTEMPTS:
        raise HTTPException(status_code=400, detail="Too many attempts. Request a new code.")
    if rec["code"] != code:
        rec["attempts"] += 1
        OTP_STORE[email] = rec
        raise HTTPException(status_code=400, detail="Invalid code.")

def _gc_otps() -> None:
    """Remove expired OTPs from memory (best-effort)."""
    now = datetime.now(timezone.utc)
    expired_keys = [k for k, v in OTP_STORE.items() if v.get("expires_at") and v["expires_at"] < now]
    for k in expired_keys:
        OTP_STORE.pop(k, None)

# =======================
#         LINK FLOW
# =======================
@router.post("/forgot-password")
async def forgot_password(req: ForgotReq, bg: BackgroundTasks):
    """
    Link-based reset: send a clickable link with a token.
    Response is generic to prevent user enumeration.
    """
    _gc_reset_tokens()
    email = req.email.lower().strip()
    user = get_user_by_email(email)

    if user:
        raw = _store_token(email)
        link = _make_reset_link(raw)
        # DEV aid (logs). Avoid printing in prod.
        if DEV_MODE:
            print("RESET LINK:", link)

        html = f"""
        <h3>Password reset</h3>
        <p>Click to reset (expires in {RESET_TOKEN_TTL_MIN} minutes):</p>
        <p><a href="{link}">{link}</a></p>
        """
        bg.add_task(send_email, email, "Reset your TalentHireAI password", html)

        # In dev/local, also return token to speed testing.
        if DEV_MODE:
            return {"message": "If this email exists, a reset link has been sent.", "dev_token": raw}

    # Generic response either way
    return {"message": "If this email exists, a reset link has been sent."}

@router.post("/reset-password")
async def reset_password(req: ResetReq):
    """
    Link-based reset: accept token + new password and update DB.
    """
    _gc_reset_tokens()
    raw_token = req.token.strip()
    if not raw_token:
        raise HTTPException(status_code=400, detail="Token required.")

    token_hash, rec = _lookup_token(raw_token)
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid or expired token.")
    if rec.get("used"):
        raise HTTPException(status_code=400, detail="Token already used.")
    if rec["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Token expired.")

    email = rec["email"]
    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=400, detail="User not found.")

    updated = set_user_password(user.id, req.new_password)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update password.")

    rec["used"] = True
    RESET_TOKENS[token_hash] = rec
    return {"message": "Password updated successfully."}

# =======================
#          OTP FLOW
# =======================
@router.post("/forgot-otp")
async def forgot_otp(req: ForgotOtpIn, bg: BackgroundTasks):
    """
    OTP-based reset: send a 6-digit code by email (valid for OTP_TTL_MIN minutes).
    Response is generic to prevent user enumeration.
    """
    _gc_otps()
    email = req.email.lower().strip()
    user = get_user_by_email(email)

    if user:
        code = _issue_otp(email)
        if DEV_MODE:
            print(f"OTP for {email} = {code}")  # DEV aid

        html = f"""
        <h3>Your TalentHireAI verification code</h3>
        <p>Enter this code to reset your password:</p>
        <h2 style="letter-spacing:4px">{code}</h2>
        <p>This code expires in {OTP_TTL_MIN} minutes.</p>
        """
        bg.add_task(send_email, email, "Your TalentHireAI password reset code", html)

        if DEV_MODE:
            return {"message": "If this email exists, a 6-digit code has been sent.", "dev_code": code}

    return {"message": "If this email exists, a 6-digit code has been sent."}

@router.post("/verify-otp")
async def verify_otp(req: VerifyOtpIn):
    """
    OTP-based reset: verify the 6-digit code (does not change password).
    """
    _gc_otps()
    email = req.email.lower().strip()
    code = req.code.strip()
    _check_otp(email, code)
    return {"ok": True, "message": "Code verified."}

@router.post("/reset-with-otp")
async def reset_with_otp(req: ResetWithOtpIn):
    """
    OTP-based reset: verify code and set new password in one call (DB update).
    """
    _gc_otps()
    email = req.email.lower().strip()
    code = req.code.strip()
    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=400, detail="User not found.")

    _check_otp(email, code)

    updated = set_user_password(user.id, req.newPassword)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update password.")

    # Invalidate OTP after success
    OTP_STORE.pop(email, None)
    return {"message": "Password updated successfully."}
