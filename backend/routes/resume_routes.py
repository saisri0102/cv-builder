from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

from backend.database import get_db
from backend.models import Resume
from backend.middleware.auth_middleware import require_user_id

router = APIRouter(prefix="/resume", tags=["Resume"])

def _uid_int(uid: str) -> int:
    try:
        return int(uid)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token subject")

# ----- Schemas (Pydantic v2) -----
class ResumeIn(BaseModel):
    title: str
    content: str
    # FE uses: "enhancer" | "upload" | "other"
    source: Optional[str] = "enhancer"

class ResumeUpdate(BaseModel):
    # Partial fields for PATCH
    title: Optional[str] = None
    content: Optional[str] = None
    source: Optional[str] = None

class ResumeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    title: str
    content: str
    source: str
    created_at: Optional[datetime] = None  # match SQLAlchemy datetime

# ----- Routes -----
@router.get("/", response_model=list[ResumeOut])
def list_resumes(db: Session = Depends(get_db), uid: str = Depends(require_user_id)):
    uid_i = _uid_int(uid)
    return (
        db.query(Resume)
        .filter(Resume.user_id == uid_i)
        .order_by(Resume.created_at.desc())
        .all()
    )

@router.get("/{resume_id}", response_model=ResumeOut)
def get_resume(resume_id: int, db: Session = Depends(get_db), uid: str = Depends(require_user_id)):
    uid_i = _uid_int(uid)
    r = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == uid_i).first()
    if not r:
        raise HTTPException(404, "Not found")
    return r

@router.post("/", response_model=ResumeOut)
def create_resume(body: ResumeIn, db: Session = Depends(get_db), uid: str = Depends(require_user_id)):
    uid_i = _uid_int(uid)
    src = (body.source or "enhancer")
    if src not in {"enhancer", "upload", "other"}:
        src = "other"
    r = Resume(user_id=uid_i, title=body.title, content=body.content, source=src)
    db.add(r); db.commit(); db.refresh(r)
    return r

@router.patch("/{resume_id}", response_model=ResumeOut)
def update_resume(resume_id: int, body: ResumeUpdate, db: Session = Depends(get_db), uid: str = Depends(require_user_id)):
    uid_i = _uid_int(uid)
    r = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == uid_i).first()
    if not r:
        raise HTTPException(404, "Not found")

    data = body.model_dump(exclude_unset=True)
    if "title" in data:
        new_title = (data["title"] or "").strip()
        if not new_title:
            raise HTTPException(400, "Title cannot be empty.")
        r.title = new_title
    if "content" in data and data["content"] is not None:
        r.content = data["content"]
    if "source" in data and data["source"] is not None:
        r.source = data["source"] if data["source"] in {"enhancer", "upload", "other"} else "other"

    db.commit(); db.refresh(r)
    return r

# Optional: dedicated rename route (handy for clarity)
class RenameIn(BaseModel):
    title: str

@router.patch("/{resume_id}/rename", response_model=ResumeOut)
def rename_resume(resume_id: int, body: RenameIn, db: Session = Depends(get_db), uid: str = Depends(require_user_id)):
    uid_i = _uid_int(uid)
    r = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == uid_i).first()
    if not r:
        raise HTTPException(404, "Not found")
    new_title = (body.title or "").strip()
    if not new_title:
        raise HTTPException(400, "Title cannot be empty.")
    r.title = new_title
    db.commit(); db.refresh(r)
    return r

@router.delete("/{resume_id}")
def delete_resume(resume_id: int, db: Session = Depends(get_db), uid: str = Depends(require_user_id)):
    uid_i = _uid_int(uid)
    r = db.query(Resume).filter(Resume.id == resume_id, Resume.user_id == uid_i).first()
    if not r:
        raise HTTPException(404, "Not found")
    db.delete(r); db.commit()
    return {"ok": True}
