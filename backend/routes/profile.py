# backend/routes/profile.py
from __future__ import annotations
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.auth_middleware import require_user_id
from backend.models import Profile  # must exist in backend/models.py

router = APIRouter(prefix="/profile", tags=["Profile"])

# ---- Schemas ----
class ExperienceItem(BaseModel):
    company: Optional[str] = ""
    title: Optional[str] = ""
    start: Optional[str] = ""
    end: Optional[str] = ""
    location: Optional[str] = ""
    bullets: List[str] = []

class ProjectItem(BaseModel):
    name: Optional[str] = ""
    stack: List[str] = []
    bullets: List[str] = []

class EducationItem(BaseModel):
    degree: Optional[str] = ""
    school: Optional[str] = ""
    year: Optional[str] = ""
    location: Optional[str] = ""
    details: List[str] = []

class CertItem(BaseModel):
    name: Optional[str] = ""
    year: Optional[str] = ""
    org: Optional[str] = ""

class ProfileIn(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    portfolio: Optional[str] = None
    summary: Optional[str] = None

    skills: List[str] = []
    experience: List[ExperienceItem] = []
    projects: List[ProjectItem] = []
    education: List[EducationItem] = []
    certifications: List[CertItem] = []

    extras: Optional[Dict[str, Any]] = None

class ProfileOut(ProfileIn):
    id: int

# ---- Helpers ----
def _get_profile_by_user(db: Session, user_id: int) -> Optional[Profile]:
    return db.query(Profile).filter(Profile.user_id == user_id).first()

def _uid(uid_str: str) -> int:
    try:
        return int(uid_str)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token subject")

# ---- Routes ----
@router.get("/me", response_model=ProfileOut)
def read_my_profile(
    db: Session = Depends(get_db),
    uid: str = Depends(require_user_id),
):
    user_id = _uid(uid)
    prof = _get_profile_by_user(db, user_id)
    if not prof:
        raise HTTPException(status_code=404, detail="Profile not found")
    return prof  # SQLAlchemy model must be Pydantic-compatible via orm_mode OR FastAPI will map attrs

@router.put("", response_model=ProfileOut)
def upsert_profile(
    body: ProfileIn,
    db: Session = Depends(get_db),
    uid: str = Depends(require_user_id),
):
    """
    Idempotent upsert:
    - create if none exists for this user
    - update otherwise
    """
    user_id = _uid(uid)
    prof = _get_profile_by_user(db, user_id)
    if not prof:
        prof = Profile(user_id=user_id)

    # Assign safe fields
    prof.full_name   = body.full_name
    prof.email       = body.email
    prof.phone       = body.phone
    prof.location    = body.location
    prof.linkedin    = body.linkedin
    prof.github      = body.github
    prof.portfolio   = body.portfolio
    prof.summary     = body.summary

    # JSON-ish fields (Profile should define these as JSON/Text columns)
    prof.skills         = list(body.skills or [])
    prof.experience     = [e.model_dump() for e in (body.experience or [])]
    prof.projects       = [p.model_dump() for p in (body.projects or [])]
    prof.education      = [e.model_dump() for e in (body.education or [])]
    prof.certifications = [c.model_dump() for c in (body.certifications or [])]
    prof.extras         = body.extras or None

    db.add(prof)
    db.commit()
    db.refresh(prof)
    return prof
