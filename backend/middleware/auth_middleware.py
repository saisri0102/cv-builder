# backend/middleware/auth_middleware.py
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import jwt  # PyJWT
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# === ENV CONFIG ===
JWT_SECRET: str = os.getenv("JWT_SECRET", "dev_insecure_change_me")
JWT_ALGO: str = os.getenv("JWT_ALGO", "HS256")
# Short-lived access tokens (minutes)
JWT_EXPIRES_MIN: int = int(os.getenv("JWT_EXPIRES_MIN", "60"))
# Optional: longer-lived refresh tokens (minutes)
JWT_REFRESH_EXPIRES_MIN: int = int(os.getenv("JWT_REFRESH_EXPIRES_MIN", str(60 * 24 * 14)))  # 14 days
# Tolerate small clock drift (seconds)
JWT_LEEWAY_SEC: int = int(os.getenv("JWT_LEEWAY_SEC", "30"))

# NOTE: auto_error=False so we can consistently return 401 on problems
security = HTTPBearer(auto_error=False)

# ---------- PUBLIC ALLOW-LIST (no auth required) ----------
PUBLIC_PATHS = {
    "/", "/openapi.json", "/docs", "/redoc",
    "/api/v1/health",
    "/api/v1/resume-cover",   # <-- generator should be PUBLIC
}

# ---------- Token creation ----------
def _now_utc() -> datetime:
    return datetime.now(timezone.utc)

def _encode(payload: Dict[str, Any]) -> str:
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def create_access_token(sub: str, extra: Optional[Dict[str, Any]] = None, minutes: Optional[int] = None) -> str:
    """
    Create a short-lived ACCESS token.
    `sub` should be the user's stable id (string).
    """
    if not isinstance(sub, str) or not sub.strip():
        raise ValueError("sub must be a non-empty string")

    exp_min = minutes if minutes is not None else JWT_EXPIRES_MIN
    now = _now_utc()
    payload: Dict[str, Any] = {
        "sub": sub,
        "typ": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=exp_min)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return _encode(payload)

def create_refresh_token(sub: str, extra: Optional[Dict[str, Any]] = None, minutes: Optional[int] = None) -> str:
    """
    OPTIONAL helper if you later add a refresh flow.
    """
    if not isinstance(sub, str) or not sub.strip():
        raise ValueError("sub must be a non-empty string")

    exp_min = minutes if minutes is not None else JWT_REFRESH_EXPIRES_MIN
    now = _now_utc()
    payload: Dict[str, Any] = {
        "sub": sub,
        "typ": "refresh",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=exp_min)).timestamp()),
    }
    if extra:
        payload.update(extra)
    return _encode(payload)

# ---------- Token decoding / validation ----------
def decode_token(token: str) -> Dict[str, Any]:
    """
    Decode & validate token. Raises 401 on any auth failure.
    """
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO], leeway=JWT_LEEWAY_SEC)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except jwt.PyJWTError:
        # Catch-all for other PyJWT exceptions
        raise HTTPException(status_code=401, detail="Invalid token")

# ---------- FastAPI dependencies (unchanged external API) ----------
def require_claims(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Dict[str, Any]:
    """
    Strict auth dependency. Returns the validated claims dict.
    Always raises 401 (not 403) if header is missing/invalid.
    """
    if credentials is None or not credentials.scheme or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = (credentials.credentials or "").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")

    return decode_token(token)

def require_user_id(claims: Dict[str, Any] = Depends(require_claims)) -> str:
    """
    Returns the authenticated user's id (the `sub` claim) as a string.
    """
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub.strip():
        raise HTTPException(status_code=401, detail="Invalid token subject")
    return sub

def optional_claims(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[Dict[str, Any]]:
    """
    Soft auth dependency. Returns claims if a valid Bearer token is present,
    otherwise returns None (no exception).
    Useful for routes that behave differently when a user is logged in,
    but still allow anonymous access.
    """
    if credentials is None:
        return None
    if not credentials.scheme or credentials.scheme.lower() != "bearer":
        return None
    token = (credentials.credentials or "").strip()
    if not token:
        return None
    try:
        return decode_token(token)
    except HTTPException:
        # Treat invalid/missing as anonymous for optional paths
        return None

def optional_user_id(claims: Optional[Dict[str, Any]] = Depends(optional_claims)) -> Optional[str]:
    """
    Returns user id (sub) if present/valid, else None.
    """
    if not claims:
        return None
    sub = claims.get("sub")
    return str(sub) if isinstance(sub, (str, int)) and str(sub).strip() else None

# ---------- Starlette middleware (allow-list + bearer enforcement) ----------
class AuthMiddleware(BaseHTTPMiddleware):
    """
    Request-level guard: lets PUBLIC_PATHS through; enforces Bearer on others.
    Also exposes decoded claims via request.state.claims and request.state.user_id.
    """
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        method = request.method.upper()

        # Always allow CORS preflights
        if method == "OPTIONS":
            return await call_next(request)

        # Allow exact public paths and their trailing-slash variants
        if path in PUBLIC_PATHS or (path.endswith("/") and path[:-1] in PUBLIC_PATHS):
            return await call_next(request)

        # For everything else, require Authorization: Bearer <token>
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)

        token = auth.split(" ", 1)[1].strip()
        try:
            claims = decode_token(token)
        except HTTPException as e:
            return JSONResponse({"detail": e.detail}, status_code=e.status_code)

        # Stash for handlers that want to read from request.state
        request.state.claims = claims
        sub = claims.get("sub")
        request.state.user_id = str(sub) if isinstance(sub, (str, int)) else None

        return await call_next(request)

__all__ = [
    "JWT_SECRET", "JWT_ALGO", "JWT_EXPIRES_MIN", "JWT_REFRESH_EXPIRES_MIN", "JWT_LEEWAY_SEC",
    "create_access_token", "create_refresh_token", "decode_token",
    "require_claims", "require_user_id", "optional_claims", "optional_user_id",
    "PUBLIC_PATHS", "AuthMiddleware",
]
