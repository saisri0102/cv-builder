# backend/routes/resume.py
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Resume

router = APIRouter(tags=["Resumes"])

# ---------- Schemas ----------
class ResumeOut(BaseModel):
    id: int
    title: str
    content: str
    source: Optional[str] = "enhanced"
    created_at: Optional[datetime] = None
    class Config:
        orm_mode = True

class SaveResumeBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    content: str = Field(..., min_length=1, max_length=200000)
    source: Optional[str] = "enhanced"

class RenameBody(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)

# ---------- Routes ----------
@router.post("/save", response_model=ResumeOut)
def save_resume(body: SaveResumeBody, db: Session = Depends(get_db)):
    try:
        resume = Resume(
            title=body.title.strip(),
            content=body.content,
            source=(body.source or "enhanced").strip(),
        )
        db.add(resume)
        db.commit()
        db.refresh(resume)
        return resume
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to save resume: {e}")

@router.get("/list", response_model=List[ResumeOut])
def list_resumes(db: Session = Depends(get_db)):
    return db.query(Resume).order_by(Resume.created_at.desc()).all()

# 🚩 move all ID-based routes under /id/{resume_id}
@router.get("/id/{resume_id}", response_model=ResumeOut)
def get_resume(resume_id: int, db: Session = Depends(get_db)):
    item = db.query(Resume).filter(Resume.id == resume_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return item

@router.delete("/id/{resume_id}")
def delete_resume(resume_id: int, db: Session = Depends(get_db)):
    item = db.query(Resume).filter(Resume.id == resume_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        db.delete(item)
        db.commit()
        return {"ok": True}
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Delete failed: {e}")

@router.patch("/id/{resume_id}/rename", response_model=ResumeOut)
def rename_resume(resume_id: int, body: RenameBody, db: Session = Depends(get_db)):
    item = db.query(Resume).filter(Resume.id == resume_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    try:
        item.title = body.title.strip()
        db.add(item)
        db.commit()
        db.refresh(item)
        return item
    except SQLAlchemyError as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Rename failed: {e}")
