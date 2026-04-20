# backend/deps.py
import os
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import User  # if your User is in backend/models.py
# If your User is in backend/models/user.py instead, use:
# from backend.models.user import User

# OAuth2 bearer (we only use it to read the Authorization: Bearer <token> header)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

# Adjust if your auth uses a different secret/alg
JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY") or "changeme"
ALGORITHM = "HS256"

def get_db():
    """Yield a DB session and ensure it closes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def _extract_user_id(payload: dict) -> Optional[int]:
    """Try common claim names for user id."""
    uid = payload.get("sub") or payload.get("user_id") or payload.get("id")
    try:
        return int(uid)
    except Exception:
        return uid  # if you use UUID/str ids

def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    """Decode JWT and return the current User."""
    cred_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
    except JWTError:
        raise cred_exc

    user_id = _extract_user_id(payload)
    if not user_id:
        raise cred_exc

    # SQLAlchemy 2.x: prefer filter().first()
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise cred_exc
    return user
