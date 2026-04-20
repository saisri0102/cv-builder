# backend/routes/enhance.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any, Literal, Set
from backend.services.openai_client import OpenAIClient
from backend.config import FEATURE_RESUME_ENHANCEMENT
import logging
import re

router = APIRouter(prefix="/enhance", tags=["Enhance"])
client = OpenAIClient()

# ----------------------------
# Skill extraction utilities
# ----------------------------

# Canonical skills (mix of hard/soft + data/eng/pm)
COMMON_SKILLS: List[str] = [
    # Languages / stacks
    "python", "java", "javascript", "typescript", "golang", "c++", "c#", "ruby", "php",
    # Web / FE
    "react", "next.js", "vue", "angular", "redux",
    # Backend
    "node", "express", "fastapi", "django", "flask", "spring", "spring boot",
    # Data
    "sql", "mysql", "postgres", "mongodb", "snowflake", "redshift", "bigquery",
    "pandas", "numpy", "scikit-learn", "tensorflow", "pytorch", "spark", "airflow",
    # DevOps / Cloud
    "docker", "kubernetes", "aws", "gcp", "azure", "terraform", "ci/cd",
    # BI / Analytics
    "excel", "tableau", "power bi", "looker",
    # Concepts
    "rest", "graphql", "microservices", "nlp", "computer vision", "feature engineering",
    "a/b testing", "experimentation", "data visualization", "etl", "elasticsearch",
    # Soft/Process
    "agile", "scrum", "kanban", "communication", "leadership", "mentoring",
    "stakeholder management", "problem solving",
]

# Simple synonym/canonical mapping
SYNONYMS = {
    "node.js": "node",
    "nodejs": "node",
    "springboot": "spring boot",
    "powerbi": "power bi",
    "ms power bi": "power bi",
    "postgreSQL".lower(): "postgres",
    "gcp": "gcp",
    "aws cloud": "aws",
    "microsoft azure": "azure",
    "ci cd": "ci/cd",
    "cicd": "ci/cd",
    "ml": "machine learning",  # optional canonicalization
    "machine-learning": "machine learning",
}

# Precompile helpful regexes
NONWORD_RE = re.compile(r"[^a-z0-9+#/.\-\s]")
WS_RE = re.compile(r"\s+")

def _normalize_text(s: str) -> str:
    s = (s or "").lower()
    s = NONWORD_RE.sub(" ", s)
    s = WS_RE.sub(" ", s).strip()
    return s

def _canonicalize_token(tok: str) -> str:
    t = tok.strip().lower()
    return SYNONYMS.get(t, t)

def _tokenize(text: str) -> Set[str]:
    t = _normalize_text(text)
    return set(filter(None, t.split(" ")))

def _find_phrases(text: str, phrases: List[str]) -> Set[str]:
    """
    Greedy detection for multi-word phrases using simple substring with word boundaries.
    """
    hay = f" { _normalize_text(text) } "
    found: Set[str] = set()
    # Check longer phrases first
    for p in sorted(phrases, key=lambda x: -len(x)):
        if " " in p:
            needle = f" { _normalize_text(p) } "
            if needle in hay:
                found.add(p)
    return found

def extract_skills(text: str) -> Set[str]:
    """
    Extract canonical skills present in the text.
    - Detects multi-word phrases first (e.g., 'power bi', 'spring boot')
    - Then single-word tokens
    - Applies synonym normalization
    """
    if not text:
        return set()

    # Multi-word phrases
    multi = [p for p in COMMON_SKILLS if " " in p]
    found = set(_find_phrases(text, multi))

    # Single tokens
    tokens = _tokenize(text)
    singles = [p for p in COMMON_SKILLS if " " not in p]
    for p in singles:
        if _canonicalize_token(p) in {_canonicalize_token(t) for t in tokens}:
            found.add(p)

    # Normalize with synonyms map
    normalized: Set[str] = set()
    for f in found:
        normalized.add(_canonicalize_token(f))
    return normalized


# ----------------------------
# Request/response models
# ----------------------------

class EnhanceRequest(BaseModel):
    resume_text: str = Field(..., max_length=20000)
    jd_text: Optional[str] = Field(default=None, max_length=20000)
    missing_keywords: List[str] = Field(default_factory=list)
    strategy: Literal["keywords_only", "rewrite_experience"] = "rewrite_experience"
    options: Optional[Dict[str, Any]] = None

    @field_validator("resume_text")
    @classmethod
    def _strip_resume(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("Resume text is required")
        return v

    @field_validator("jd_text")
    @classmethod
    def _strip_jd(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() or None

    @field_validator("missing_keywords")
    @classmethod
    def _cap_keywords(cls, v: List[str]) -> List[str]:
        seen = set()
        cleaned = []
        for kw in v or []:
            s = (kw or "").strip()
            if not s:
                continue
            key = s.lower()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(s)
            if len(cleaned) >= 200:
                break
        return cleaned


class KeywordRequest(BaseModel):
    resume_text: str = Field(..., max_length=20000)
    jd_text: str = Field(..., max_length=20000)

    @field_validator("resume_text")
    @classmethod
    def _strip_resume_kw(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("resume_text is required")
        return v

    @field_validator("jd_text")
    @classmethod
    def _strip_jd_kw(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("jd_text is required")
        return v


class KeywordResponse(BaseModel):
    matched: List[str]
    missing: List[str]
    extras: List[str]


# ----------------------------
# Endpoints
# ----------------------------

@router.post("")
async def enhance_resume(request: EnhanceRequest):
    """
    Enhance/Rewrite a resume. If `missing_keywords` is empty but `jd_text` is present,
    we auto-compute missing keywords (resume ↔ JD) and pass them to the prompt.
    """
    if not FEATURE_RESUME_ENHANCEMENT:
        raise HTTPException(status_code=403, detail="Resume enhancement is disabled")

    # Auto-compute missing keywords if JD is provided and user didn't pass any
    auto_missing: List[str] = []
    if (not request.missing_keywords) and request.jd_text:
        try:
            res_sk = extract_skills(request.resume_text)
            jd_sk = extract_skills(request.jd_text)
            auto_missing = sorted(jd_sk - res_sk)
        except Exception:
            # Don't fail enhancement if extraction slips
            auto_missing = []

    kws = request.missing_keywords or auto_missing or []
    keywords_line = ", ".join(kws) if kws else "None provided"

    rewrite_strength = 0.7
    if isinstance(request.options, dict):
        try:
            rs = float(request.options.get("rewrite_strength", rewrite_strength))
            rewrite_strength = max(0.0, min(1.0, rs))
        except Exception:
            pass

    # Optional: light role mismatch nudge
    role_hint = ""
    jd_lower = (request.jd_text or "").lower()
    resume_lower = request.resume_text.lower()
    if "java" in jd_lower and "data analyst" in resume_lower:
        role_hint = (
            "\nNote: The job description is for a Java Developer, "
            "but the resume appears to be for a Data Analyst. "
            "Do not fabricate experience—rewrite responsibly based on provided content."
        )
    elif "data analyst" in jd_lower and "java" in resume_lower:
        role_hint = (
            "\nNote: The job description is for a Data Analyst, "
            "but the resume appears to mention Java heavily. "
            "Rewrite responsibly and maintain consistency with actual experience."
        )

    # Prompt generation
    if request.strategy == "keywords_only":
        prompt = (
            "You are a resume writing assistant.\n\n"
            "Task:\n"
            "- Improve clarity, action verbs, and ATS alignment.\n"
            "- Keep the original structure and experience as-is.\n"
            "- Weave in the provided keywords naturally (avoid keyword stuffing).\n"
            "- Output only the enhanced resume (no commentary).\n\n"
            f"Keywords to incorporate: {keywords_line}\n\n"
            f"Original resume:\n{request.resume_text}\n\n"
            "Enhanced resume:"
        )
    else:
        prompt = (
            "You are a senior resume writer.\n\n"
            "Goal:\n"
            "- Rewrite the Summary and Experience sections to align strongly with the Job Description.\n"
            "- Weave missing keywords naturally (no stuffing) and quantify outcomes when possible.\n"
            "- Keep a professional tone, preserve section headings, and keep Education/Certifications intact.\n"
            "- Avoid fabricating employers or projects; phrase responsibly based on the existing content.\n"
            "- Respect concision: rewrite_strength controls how bold the rewrites are (0=minimal, 1=bold).\n"
            "- Output only the final resume text."
            f"{role_hint}\n\n"
            f"rewrite_strength: {rewrite_strength}\n"
            f"Missing keywords: {keywords_line}\n\n"
            f"Job Description (for alignment):\n{request.jd_text or ''}\n\n"
            f"Original resume:\n{request.resume_text}\n\n"
            "Rewritten resume:"
        )

    try:
        enhanced_text = client.get_completion(
            prompt=prompt,
            system_prompt="You are a helpful, concise resume writing assistant.",
            temperature=0.6 if request.strategy == "keywords_only" else 0.7,
        )

        return {
            "rewritten_resume": enhanced_text,
            "enhanced_resume": enhanced_text,
            "improved_resume": enhanced_text,
            "used_keywords": kws,
            "auto_missing_keywords": auto_missing,
            "strategy": request.strategy,
        }
    except Exception as e:
        logging.exception("❌ OpenAI enhancement error")
        raise HTTPException(status_code=500, detail=f"Enhancement failed: {str(e)}")


@router.post("/keywords", response_model=KeywordResponse)
async def extract_keywords(req: KeywordRequest):
    """
    Extract skills from resume & JD and compute:
      - matched: skills in both
      - missing: in JD but not in resume (opportunities to highlight)
      - extras: in resume but not in JD
    This endpoint is lightweight and does NOT call the LLM.
    """
    try:
        res_sk = extract_skills(req.resume_text)
        jd_sk = extract_skills(req.jd_text)

        matched = sorted(res_sk & jd_sk)
        missing = sorted(jd_sk - res_sk)
        extras = sorted(res_sk - jd_sk)

        return KeywordResponse(matched=matched, missing=missing, extras=extras)
    except Exception as e:
        logging.exception("❌ Keyword extraction error")
        raise HTTPException(status_code=500, detail=f"Keyword analysis failed: {str(e)}")
