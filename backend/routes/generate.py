# backend/routes/generate.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
from backend.services.openai_client import OpenAIClient
import logging
import re

router = APIRouter()
client = OpenAIClient()

# ======== Schemas ========

class GenerateRequest(BaseModel):
    prompt: str = Field(..., max_length=5000)
    system_prompt: Optional[str] = None
    temperature: float = 0.7


class InterviewRequest(BaseModel):
    resume_text: str = Field(..., max_length=10000)
    jd_text: str = Field(..., max_length=10000)
    role: str = Field(..., max_length=100)
    question: str = Field(..., max_length=500)
    question_type: str = Field(..., max_length=50)


class AssistantRequest(BaseModel):
    message: str = Field(..., max_length=5000)


class InterviewQuestionsRequest(BaseModel):
    role: str = Field(..., max_length=120)
    experience: str = Field(..., max_length=120)  # e.g., "2 years" / "junior"
    focus: Optional[str] = Field(None, max_length=60)  # "technical" | "behavioral" | "system design"
    count: int = Field(5, ge=3, le=12)


class InterviewQuestionsResponse(BaseModel):
    questions: List[str]


# NEW: Follow-ups
class FollowupRequest(BaseModel):
    question: str = Field(..., max_length=600)
    answer: str = Field(..., max_length=8000)
    role: str = Field("Candidate", max_length=120)
    type: str = Field("behavioral", max_length=60)  # "technical" | "behavioral" | "system design"
    count: int = Field(4, ge=2, le=8)


class FollowupResponse(BaseModel):
    followups: List[str]


# ======== Helpers ========

_LIST_PREFIX_RE = re.compile(r"^\s*([0-9]+[\.)\-:]|\-|\*|•)\s*")

def _normalize_list_output(raw: str) -> List[str]:
    """
    Turn a model's multiline output into a clean list of strings:
    - remove numbering/bullets
    - drop empties/duplicates
    """
    if not raw:
        return []
    lines = [l.strip() for l in str(raw).splitlines()]
    items: List[str] = []
    seen = set()
    for l in lines:
        if not l:
            continue
        l = _LIST_PREFIX_RE.sub("", l).strip()
        if not l:
            continue
        if l not in seen:
            items.append(l)
            seen.add(l)
    return items


def _fallback_followups(kind: str) -> List[str]:
    k = (kind or "").lower()
    if k.startswith("tech"):
        return [
            "What trade-offs did you consider in your solution design?",
            "How did you measure performance and identify bottlenecks?",
            "If traffic/data grew 10x, what would you change first?",
            "Describe your testing strategy and how you ensured reliability.",
        ]
    if k.startswith("system"):
        return [
            "How would you partition data and pick SQL vs NoSQL here?",
            "Walk me through your caching and cache invalidation approach.",
            "What is your consistency model and why?",
            "How would you design monitoring and alerting for this system?",
        ]
    # behavioral default
    return [
        "What alternatives did you evaluate and why did you choose this approach?",
        "How did you quantify the impact? Which metric improved?",
        "What was the biggest risk and how did you mitigate it?",
        "What would you do differently next time and why?",
    ]


# ======== Endpoints ========

@router.post("/generate", tags=["OpenAI"])
async def generate_text(request: GenerateRequest):
    """
    Generic text generation endpoint.
    """
    try:
        response = client.get_completion(
            prompt=request.prompt,
            system_prompt=request.system_prompt,
            temperature=request.temperature
        )
        return {"response": response}
    except Exception as e:
        logging.exception("❌ OpenAI generation error")
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


@router.post("/generate-answer", tags=["OpenAI"])
async def generate_answer(request: InterviewRequest):
    """
    Draft a tailored interview answer using resume + JD context.
    """
    prompt = (
        f"You are an expert interview coach helping candidates prepare for a {request.role} role.\n\n"
        f"Resume:\n{request.resume_text}\n\n"
        f"Job Description:\n{request.jd_text}\n\n"
        f"Question Type: {request.question_type}\n"
        f"Interview Question: {request.question}\n\n"
        f"Generate a strong, professional answer tailored to the resume and job description."
    )
    try:
        answer = client.get_completion(
            prompt=prompt,
            system_prompt="You are a helpful interview coach.",
            temperature=0.7
        )
        return {"answer": answer}
    except Exception as e:
        logging.exception("❌ OpenAI answer generation error")
        raise HTTPException(status_code=500, detail=f"Answer generation failed: {str(e)}")


@router.post("/interview-assistant", tags=["OpenAI"])
async def interview_assistant(request: AssistantRequest):
    """
    Free-form interview assistant chat.
    """
    try:
        response = client.get_completion(
            prompt=request.message,
            system_prompt="You are an AI-powered interview coach.",
            temperature=0.7
        )
        return {"reply": response}
    except Exception as e:
        logging.exception("❌ Interview assistant error")
        raise HTTPException(status_code=500, detail=f"Assistant response failed: {str(e)}")


@router.post("/generate-questions", tags=["OpenAI"], response_model=InterviewQuestionsResponse)
async def generate_questions(req: InterviewQuestionsRequest):
    """
    Generate a clean list of interview questions for a given role/experience/focus.
    """
    focus_txt = f"{req.focus} " if req.focus else ""
    prompt = (
        f"You are an expert interview coach. Generate {req.count} {focus_txt}"
        f"interview questions for a {req.role} candidate with {req.experience} experience.\n"
        f"Return a clean numbered list, one question per line, no extra commentary."
    )

    try:
        raw = client.get_completion(
            prompt=prompt,
            system_prompt="You are concise and produce clean lists.",
            temperature=0.6
        )
        cleaned = _normalize_list_output(raw)[: req.count]
        if not cleaned:
            raise ValueError("Empty questions from model")
        return InterviewQuestionsResponse(questions=cleaned)
    except Exception as e:
        logging.exception("❌ Interview question generation error")
        raise HTTPException(status_code=500, detail=f"Question generation failed: {str(e)}")


# ======== NEW: Follow-up Questions ========

@router.post("/generate-followups", tags=["OpenAI"], response_model=FollowupResponse)
async def generate_followups(req: FollowupRequest):
    """
    Generate smart follow-up interview questions based on a candidate's answer.
    Compatible with the frontend payload: {question, answer, role, type}.
    """
    q = (req.question or "").strip()
    a = (req.answer or "").strip()
    if not q or not a:
        raise HTTPException(status_code=400, detail="question and answer are required")

    prompt = (
        "You are an expert interviewer. Read the candidate's answer and propose follow-up questions "
        "that dig deeper into trade-offs, metrics, risks, decision-making, and role fit.\n\n"
        f"Role: {req.role}\n"
        f"Interview Type: {req.type}\n\n"
        f"Original Question:\n{q}\n\n"
        f"Candidate Answer:\n{a}\n\n"
        f"Now generate {req.count} concise follow-up questions.\n"
        "Return a numbered list, one question per line. Do not include explanations."
    )

    try:
        raw = client.get_completion(
            prompt=prompt,
            system_prompt="You are concise and probing; return only follow-up questions.",
            temperature=0.5,
        )
        items = _normalize_list_output(raw)
        if not items:
            # safe fallback
            items = _fallback_followups(req.type)
        return FollowupResponse(followups=items[: req.count])
    except Exception as e:
        logging.exception("❌ Follow-up generation error")
        # graceful fallback rather than 500, so UX is smoother
        return FollowupResponse(followups=_fallback_followups(req.type)[: req.count])
