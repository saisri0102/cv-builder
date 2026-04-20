# backend/routes/feedback.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
from sqlalchemy.orm import Session
import logging
import re

from backend.database import get_db
from backend.models import Feedback
from backend.services.openai_client import OpenAIClient

router = APIRouter()
client = OpenAIClient()

# =========================
# 📦 Pydantic Schemas
# =========================

class FeedbackIn(BaseModel):
    question: str = Field(..., max_length=5000)
    answer: str = Field(..., max_length=20000)
    feedback: str = Field(..., max_length=20000)

class InterviewFeedbackRequest(BaseModel):
    # Primary, supported fields
    question: str = Field(..., max_length=600, description="Interview question")
    answer: Optional[str] = Field(None, max_length=6000, description="Candidate's answer")
    style: str = Field("STAR", max_length=40, description="STAR | CAR | custom")
    role: Optional[str] = Field(None, max_length=120)
    resume_text: Optional[str] = Field(None, max_length=10000)
    jd_text: Optional[str] = Field(None, max_length=10000)
    save: bool = Field(False, description="If true, save feedback to DB")

    # 🔁 Back-compat aliases (some clients send these)
    answer_transcript: Optional[str] = Field(None, alias="answer_transcript", description="Alias for 'answer'")
    target_role: Optional[str] = Field(None, alias="target_role", description="Alias for 'role'")

    class Config:
        allow_population_by_field_name = True
        extra = "ignore"  # ignore unknown fields like 'mode' or 'rubric' from older clients

class InterviewFeedbackResponse(BaseModel):
    score: int
    strengths: List[str]
    improvements: List[str]
    improved_answer: str
    saved_id: Optional[int] = None

# =========================
# 🔁 CRUD ROUTES (JSON body)
# =========================

@router.post("/feedback/", status_code=201)
def create_feedback(payload: FeedbackIn, db: Session = Depends(get_db)):
    """
    Create a feedback row from JSON body.
    """
    new_feedback = Feedback(
        question=payload.question,
        answer=payload.answer,
        feedback=payload.feedback,
    )
    db.add(new_feedback)
    db.commit()
    db.refresh(new_feedback)
    return {"message": "Feedback submitted successfully", "id": new_feedback.id}

@router.get("/feedback/{feedback_id}")
def get_feedback(feedback_id: int, db: Session = Depends(get_db)):
    """
    Fetch a single feedback by ID.
    """
    feedback = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")
    return feedback

@router.get("/feedback/")
def get_all_feedback(db: Session = Depends(get_db)):
    """
    List all feedback rows (newest-first if created_at exists).
    """
    q = db.query(Feedback)
    # If your model has created_at, order by it; else fall back to id desc
    if hasattr(Feedback, "created_at"):
        q = q.order_by(Feedback.created_at.desc())
    else:
        q = q.order_by(Feedback.id.desc())
    return q.all()

@router.put("/feedback/{feedback_id}")
def update_feedback(feedback_id: int, payload: FeedbackIn, db: Session = Depends(get_db)):
    """
    Update a feedback row using JSON body.
    """
    entry = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Feedback not found")

    entry.question = payload.question
    entry.answer = payload.answer
    entry.feedback = payload.feedback

    db.commit()
    db.refresh(entry)

    return {"message": "Feedback updated successfully", "updated_data": entry}

@router.delete("/feedback/{feedback_id}")
def delete_feedback(feedback_id: int, db: Session = Depends(get_db)):
    """
    Delete a feedback row by ID.
    """
    entry = db.query(Feedback).filter(Feedback.id == feedback_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Feedback not found")

    db.delete(entry)
    db.commit()
    return {"message": "Feedback deleted successfully"}

# ==========================================
# ✨ AI: INTERVIEW ANSWER COACHING ENDPOINT
# ==========================================

@router.post("/feedback/interview-answer", response_model=InterviewFeedbackResponse)
def interview_answer_feedback(
    req: InterviewFeedbackRequest,
    db: Session = Depends(get_db),
):
    """
    Evaluates an interview answer and returns:
      - score (0-10)
      - strengths (bullets)
      - improvements (bullets)
      - improved_answer (concise rewrite)
    Optionally saves the feedback to DB when req.save == True.

    Back-compat:
    - Accepts either 'answer' or 'answer_transcript'
    - Accepts either 'role' or 'target_role'
    - Ignores unknown legacy fields like 'mode'/'rubric'
    """
    # ---- Back-compat field resolution ----
    answer_text = (req.answer or req.answer_transcript or "").strip()
    if not answer_text:
        raise HTTPException(status_code=422, detail="Answer is required (field 'answer' or 'answer_transcript').")

    role_text = (req.role or req.target_role or "").strip() or None

    # ---- Build optional context ----
    context_bits = []
    if role_text:
        context_bits.append(f"Role: {role_text}")
    if req.resume_text:
        context_bits.append(f"Resume:\n{req.resume_text}")
    if req.jd_text:
        context_bits.append(f"Job Description:\n{req.jd_text}")
    context = "\n\n".join(context_bits)

    # ---- Prompt ----
    prompt = (
        f"You are an expert interview coach.\n"
        f"Evaluate the candidate's answer using {req.style} structure. Be concise and actionable.\n\n"
        f"{context}\n\n" if context else
        f"You are an expert interview coach.\n"
        f"Evaluate the candidate's answer using {req.style} structure. Be concise and actionable.\n\n"
    )
    prompt += (
        f"Interview Question:\n{req.question}\n\n"
        f"Candidate Answer:\n{answer_text}\n\n"
        "Respond in EXACTLY this format:\n"
        "SCORE: x/10\n"
        "STRENGTHS:\n- item\n- item\n"
        "IMPROVEMENTS:\n- item\n- item\n"
        "IMPROVED_ANSWER:\n<3–6 sentence improved answer using the specified structure and concrete metrics>"
    )

    try:
        raw = client.get_completion(
            prompt=prompt,
            system_prompt="You are an interview coach. Output MUST follow the requested headings exactly.",
            temperature=0.5,
        )
        text = str(raw or "")

        # ---- Parse the model output into structured fields ----
        # SCORE: robust extraction (first integer 0-10 before /10)
        score_num = 6
        m = re.search(r"SCORE:\s*(\d{1,2})\s*/\s*10", text, flags=re.I)
        if m:
            try:
                val = int(m.group(1))
                score_num = max(0, min(10, val))
            except Exception:
                pass

        def collect_list(section: str) -> List[str]:
            """
            Collect '- item' lines under the given SECTION: header until next SECTION or end.
            """
            items: List[str] = []
            # Normalize newlines; find section start
            pattern = re.compile(rf"^{section}\s*$", flags=re.I | re.M)
            start = pattern.search(text)
            if not start:
                return items
            # Slice from start to either next big header or end
            after = text[start.end():]
            stop = re.search(r"^\s*(STRENGTHS:|IMPROVEMENTS:|IMPROVED_ANSWER:)\s*$", after, flags=re.I | re.M)
            block = after[: stop.start()] if stop else after
            # Collect bullets (accept -, *, •)
            for line in block.splitlines():
                line = line.strip()
                if not line:
                    continue
                bullet = re.sub(r"^(\-|\*|•)\s*", "", line)
                if bullet:
                    items.append(bullet)
            return items

        strengths = collect_list("STRENGTHS:")
        improvements = collect_list("IMPROVEMENTS:")

        # Improved answer section
        improved_answer = ""
        m2 = re.search(r"IMPROVED_ANSWER:\s*(.*)$", text, flags=re.I | re.S)
        if m2:
            improved_answer = m2.group(1).strip()

        saved_id: Optional[int] = None
        if req.save:
            try:
                # Store a readable feedback blob
                feedback_text = (
                    f"SCORE: {score_num}/10\n"
                    f"STRENGTHS:\n" + "\n".join(f"- {s}" for s in strengths or []) + "\n"
                    f"IMPROVEMENTS:\n" + "\n".join(f"- {i}" for i in improvements or []) + "\n"
                    f"IMPROVED_ANSWER:\n{improved_answer}".strip()
                )
                entry = Feedback(
                    question=req.question,
                    answer=answer_text,
                    feedback=feedback_text,
                )
                db.add(entry)
                db.commit()
                db.refresh(entry)
                saved_id = entry.id
            except Exception:
                logging.exception("❌ Failed to save feedback to DB")

        return InterviewFeedbackResponse(
            score=score_num,
            strengths=strengths or ["Clear structure"],
            improvements=improvements or ["Add measurable impact and outcome"],
            improved_answer=improved_answer or "Here is a concise STAR answer with stronger metrics and results.",
            saved_id=saved_id,
        )

    except Exception as e:
        logging.exception("❌ Interview feedback error")
        raise HTTPException(status_code=500, detail=f"Feedback failed: {str(e)}")
