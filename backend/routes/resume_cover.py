# backend/routes/resume_cover.py
from __future__ import annotations

import os
import re
import textwrap
import datetime as _dt
from typing import Optional, Any, Dict

from fastapi import APIRouter, HTTPException, Depends, Body, Header
from sqlalchemy.orm import Session

from backend.database import get_db, SessionLocal
from backend.models import Profile, User, Resume

# =========================
#   BLANK-LINE NORMALIZER
# =========================
try:
    from backend.utils.text_normalize import squeeze_blank_lines  # optional helper if you have it
except Exception:
    def squeeze_blank_lines(s: str) -> str:
        out = []
        prev_blank = False
        for ln in (s or "").splitlines():
            cur_blank = (ln.strip() == "")
            if cur_blank and prev_blank:
                continue
            out.append(ln)
            prev_blank = cur_blank
        return "\n".join(out).strip()

# =========================
#      DIRECT JWT AUTH
# =========================
try:
    import jwt  # PyJWT
except Exception as e:
    raise RuntimeError("PyJWT is required. Install with: pip install PyJWT") from e

JWT_SECRET = os.getenv("JWT_SECRET") or os.getenv("SECRET_KEY")
JWT_ALGO = os.getenv("JWT_ALGO", "HS256")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET (or SECRET_KEY) is missing in environment variables.")

def get_current_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.split()[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub") or payload.get("user_id")
    email = payload.get("email")

    user: Optional[User] = None
    if user_id is not None:
        try:
            user = db.query(User).filter(User.id == int(user_id)).first()
        except Exception:
            user = None
    if not user and email:
        user = db.query(User).filter(User.email == email).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return user

# ⬇️ Optional auth for PUBLIC generator (lazy; no DB unless token present)
def get_optional_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> Optional[User]:
    """
    Return User if a valid Bearer token is present; otherwise None.
    Never raises—keeps /resume-cover public. Opens a DB session ONLY when a token exists.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None

    token = authorization.split()[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except Exception:
        return None

    user_id = payload.get("sub") or payload.get("user_id")
    email = payload.get("email")

    db = SessionLocal()
    try:
        user: Optional[User] = None
        if user_id is not None:
            try:
                user = db.query(User).filter(User.id == int(user_id)).first()
            except Exception:
                user = None
        if not user and email:
            user = db.query(User).filter(User.email == email).first()
        return user
    finally:
        db.close()

# =========================
#   OPTIONAL OPENAI CLIENT
# =========================
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
USE_AI = bool(OPENAI_API_KEY)

try:
    from openai import OpenAI
    _openai_available = True
except Exception:
    _openai_available = False
    USE_AI = False

def _openai_client() -> Optional[Any]:
    if not (USE_AI and _openai_available):
        return None
    try:
        return OpenAI(api_key=OPENAI_API_KEY)
    except Exception:
        return None

# =========================
#   STRUCTURED SYSTEM PROMPTS
# =========================
RESUME_SYSTEM = """
You are a professional resume writer and career coach.
Generate resumes in a polished, ATS-friendly, recruiter-friendly format.

OUTPUT FORMAT (exact section order):
1) CONTACT (exactly as provided; never invent)
2) PROFESSIONAL SUMMARY
   - 3–4 sentences
   - State years of experience, role, and key tools (Python, SQL, Tableau, Power BI, etc.)
3) CORE SKILLS
   Programming & Tools: Python • R • SQL • Tableau • Power BI
   Analytics & Modeling: Predictive Modeling • Statistical Analysis • Data Visualization
   Data Management: Data Cleaning • Data Mining • Database Management
   Business Focus: Strategic Decision-Making • Cross-Functional Collaboration • Business Efficiency
   (⚠️ If user provides different skills, adapt the categories but keep inline bullet style with “•”)
4) EXPERIENCE (reverse chronological)
   - Company — Title | Dates
   - 3–5 bullets per role
   - Each bullet must start with a strong verb and include a metric (%/time saved/revenue impact)
   - Mention tools/technologies where possible
5) EDUCATION
   - Degree — University, City, ST | Graduation Year
6) CERTIFICATIONS
   - Only list actual provided certifications (never invent)

STYLE RULES:
- Use "•" (bullet dot) at the start of each achievement in EXPERIENCE and PROJECTS.
- Section headings in ALL CAPS.
- Inline “•” separators for skills.
- No dashes "-" for bullets.
- No tables, no columns, no graphics.
...
"""

COVER_SYSTEM = """
You are a professional cover letter writer.
Create a clean, business-style, one-page cover letter aligned to the role/company.

OUTPUT FORMAT:
- CONTACT (exactly as provided; never invent)
- DATE (Month DD, YYYY)
- GREETING (use company/name if provided; else "Dear Hiring Manager,")
- BODY (3–5 short paragraphs):
  1) Opening: the role and enthusiasm
  2) Core fit: 1–2 quantified achievements mapped to role needs
  3) Tools & approach: SQL/Python/BI/ML as relevant to JD
  4) Why this company/team
  5) Closing: availability & call to action
- SIGN-OFF: "Sincerely," + name from contact block

STYLE & RULES:
- Professional, concise, confident tone (300–400 words).
- Mirror role/company keywords if provided.
- No placeholders. Do NOT invent employers, dates, or credentials.
"""

def _call_openai(system_prompt: str, user_prompt: str) -> str:
    """
    Calls OpenAI if available; otherwise uses a local fallback.
    Any exception falls back to local.
    """
    client = _openai_client()
    if not client:
        return _local_fallback(system_prompt, user_prompt)
    try:
        resp = client.chat.completions.create(
            model=os.getenv("DEFAULT_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
            max_tokens=1600,
        )
        return (resp.choices[0].message.content or "").strip()
    except Exception:
        return _local_fallback(system_prompt, user_prompt)

def _local_fallback(system_prompt: str, user_prompt: str) -> str:
    """
    Predictable, nicely formatted offline template so UX stays clean if AI is unavailable.
    Pulls CONTACT BLOCK from user_prompt when present.
    """
    # Extract contact block from user_prompt
    contact = ""
    if "CONTACT BLOCK" in user_prompt:
        after = user_prompt.split("CONTACT BLOCK", 1)[1].lstrip("\n")
        lines = []
        for ln in after.splitlines():
            if not ln.strip():
                break
            lines.append(ln)
        contact = "\n".join(lines).strip()

    # Decide resume vs cover by system prompt hint
    is_resume = "resume writer" in system_prompt.lower()
    today = _dt.date.today().strftime("%B %d, %Y")
    name = (contact.splitlines()[0].strip() if contact else "Candidate").strip()

    if is_resume:
        body = textwrap.dedent("""
        PROFESSIONAL SUMMARY
        Data Analyst with proven experience in statistical analysis, predictive modeling, and BI. Skilled in SQL, Python, Tableau, and Power BI to deliver data-driven insights and measurable business outcomes.

        CORE SKILLS
        Programming & Tools: Python, SQL, Advanced Excel, Tableau, Power BI
        Analytics & Modeling: Statistical Analysis, Predictive Modeling, Machine Learning, A/B Testing
        Data Management: Data Cleaning, Preprocessing, ETL, Data Integration
        Business Focus: KPI Reporting, Trend Analysis, Process Optimization, BI Dashboards

        EXPERIENCE
        Company — Senior Data Analyst | 2017–Present
        • Led analytics initiatives that improved operational efficiency by 30%.
        • Built dashboards in Tableau/Power BI for exec decision-making.
        • Automated pipelines with SQL/Python; reduced manual work by 10+ hrs/wk.

        Company — Data Analyst | 2015–2017
        • Analyzed large datasets to identify trends; improved efficiency by 15%.
        • Collaborated cross-functionally to streamline reporting workflows.

        PROJECTS
        Customer Retention Analysis (2019)
        • Forecasting & churn insights; improved retention by 25% using scikit-learn & SQL.

        EDUCATION
        Master’s in Data Science — University | 2015
        Bachelor’s in Computer Science — University | 2013

        CERTIFICATIONS
        Certified Data Analyst — Institution
        """).strip()
        return (contact + ("\n\n" + body if body else "")).strip()

    # Cover letter fallback
    body = textwrap.dedent(f"""
    {today}

    Dear Hiring Manager,

    I am excited to apply for the Data Analyst role. I bring hands-on experience with SQL, Python, Tableau, and statistical modeling to translate complex data into actionable insights.

    In prior roles, I led analytics projects that improved efficiency by 30% and delivered dashboards that accelerated decision-making. I also automated ETL workflows with SQL/Python to reduce manual effort by 10+ hours per week.

    I would welcome the opportunity to contribute the same focus on measurable impact to your team.

    Sincerely,
    {name}
    """).strip()
    return (contact + ("\n\n" + body if body else "")).strip()

# =========================
#   PROFILE / CONTACT BLOCK
# =========================
def _safe_join(*parts: Optional[str], sep: str = " | ") -> str:
    vals = [p.strip() for p in parts if p and str(p).strip()]
    return sep.join(vals)

def _format_contact_block(profile: Optional[Profile], user: Optional[User]) -> str:
    full_name = (getattr(profile, "full_name", None) or getattr(profile, "name", None) or (user.email.split("@")[0] if user else "")).strip()
    email     = (getattr(profile, "email", None) or getattr(user, "email", "") or "").strip()
    phone     = (getattr(profile, "phone", None) or "").strip()

    city      = (getattr(profile, "city", None) or "").strip()
    state     = (getattr(profile, "state", None) or "").strip()
    location  = ", ".join([p for p in (city, state) if p])

    linkedin  = (getattr(profile, "linkedin", None) or "").strip()
    github    = (getattr(profile, "github", None) or "").strip()
    links     = _safe_join(linkedin, github)

    lines = [full_name]
    if location: lines.append(location)
    if phone:    lines.append(phone)
    if email:    lines.append(email)
    if links:    lines.append(links)

    return "\n".join([ln for ln in lines if ln.strip()]).strip()

def _fetch_profile(db: Session, user_id: int) -> Optional[Profile]:
    return db.query(Profile).filter(Profile.user_id == user_id).first()

# =========================
#   POST-PROCESS SAFETY
# =========================
_PLACEHOLDER_LINES = {
    "your name", "you@example.com", "city, st",
    "linkedin.com/in/example", "github.com/example", "000-000-0000"
}

def _strip_placeholder_header(text: str) -> str:
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        low = lines[i].strip().lower()
        if not low:
            i += 1
            continue
        if any(tok in low for tok in _PLACEHOLDER_LINES):
            i += 1
            continue
        break
    return "\n".join(lines[i:]).lstrip()

def _normalize_inline(s: str) -> str:
    return re.sub(r"\W+", "", s or "").lower()

def _force_contact_on_top(contact_block: str, content: str) -> str:
    content = content.strip()
    content = _strip_placeholder_header(content)
    if contact_block and content.startswith(contact_block):
        return content
    body = content.replace(contact_block, "").strip()
    return (contact_block + ("\n\n" if body else "") + body).strip()

def _dedupe_contact_block(contact_block: str, content: str) -> str:
    content = content.strip()
    if not (contact_block and content.startswith(contact_block)):
        return content

    contact_lines = [ln.strip() for ln in contact_block.splitlines() if ln.strip()]
    name = contact_lines[0] if contact_lines else ""
    phone = next((ln for ln in contact_lines if re.search(r"\d", ln)), "")
    email = next((ln for ln in contact_block.splitlines() if "@" in ln), "")

    body = content[len(contact_block):].lstrip("\n")
    if not body:
        return content

    parts = body.split("\n\n", 1)
    head = parts[0]
    tail = parts[1] if len(parts) > 1 else ""

    head_norm = _normalize_inline(head)
    signals = [_normalize_inline(s) for s in (name, phone, email) if s]
    if any(sig and sig in head_norm for sig in signals):
        new_body = tail.strip()
        return (contact_block + ("\n\n" + new_body if new_body else "")).strip()

    return content

# =========================
#   NEW: SECTION HELPERS
# =========================
def _coerce_text(val) -> str:
    """Accept str | list[str] | dict | None and return clean text."""
    if val is None:
        return ""
    if isinstance(val, str):
        return val.strip()
    if isinstance(val, (list, tuple)):
        items = [str(x).strip() for x in val if str(x).strip()]
        return "\n".join(items)
    if isinstance(val, dict):
        parts = []
        for k, v in val.items():
            vs = _coerce_text(v)
            if vs:
                parts.append(f"{k}: {vs}")
        return "\n".join(parts)
    return str(val).strip()

def _pick(*vals, default: str = "") -> str:
    for v in vals:
        s = _coerce_text(v)
        if s:
            return s
    return default

def _derive_role_from_guidance(guidance: str) -> str:
    m = re.search(
        r"\b(data analyst|business analyst|software engineer|ml engineer|full[- ]stack|frontend|backend|data scientist)\b",
        guidance,
        re.I,
    )
    return (m.group(1).title() if m else "").strip()

def _profile_sections(profile: Optional[Profile]) -> dict:
    """Extracts all supported fields from Profile, flexible to your DB columns."""
    if not profile:
        return {}
    return {
        "full_name":      _pick(getattr(profile, "full_name", None), getattr(profile, "name", None)),
        "email":          _coerce_text(getattr(profile, "email", None)),
        "phone":          _coerce_text(getattr(profile, "phone", None)),
        "location":       _pick(
                              _coerce_text(", ".join([x for x in [getattr(profile, "city", None), getattr(profile, "state", None)] if _coerce_text(x)])),
                              _coerce_text(getattr(profile, "location", None))
                           ),
        "linkedin":       _coerce_text(getattr(profile, "linkedin", None)),
        "github":         _coerce_text(getattr(profile, "github", None)),
        "portfolio":      _coerce_text(getattr(profile, "portfolio", None)),
        "summary":        _coerce_text(getattr(profile, "summary", None)),
        "skills":         _coerce_text(getattr(profile, "skills", None)),
        "experience":     _coerce_text(getattr(profile, "experience", None)),
        "education":      _coerce_text(getattr(profile, "education", None)),
        "certifications": _coerce_text(getattr(profile, "certifications", None)),
        "projects":       _coerce_text(getattr(profile, "projects", None)),
    }

def _merge_sections(base: dict, overrides: Optional[dict]) -> dict:
    overrides = overrides or {}
    merged = dict(base)
    for k in [
        "full_name","email","phone","location","linkedin","github","portfolio",
        "summary","skills","experience","education","certifications","projects"
    ]:
        if k in overrides:
            merged[k] = _coerce_text(overrides.get(k))
    return merged

# =========================
#   PROMPT BUILDERS
# =========================
def _resume_prompt(contact_block: str, sections: dict, role: str, guidance: str) -> str:
    return (
        "CONTACT BLOCK\n"
        f"{contact_block}\n\n"
        "ROLE / FOCUS\n"
        f"{role or '(unspecified)'}\n\n"
        "CANDIDATE SECTIONS (use only what's present; omit empty sections)\n"
        f"SUMMARY:\n{sections.get('summary','')}\n\n"
        f"SKILLS:\n{sections.get('skills','')}\n\n"
        f"EXPERIENCE:\n{sections.get('experience','')}\n\n"
        f"EDUCATION:\n{sections.get('education','')}\n\n"
        f"CERTIFICATIONS:\n{sections.get('certifications','')}\n\n"
        f"PROJECTS:\n{sections.get('projects','')}\n\n"
        "GUIDANCE (job description or notes):\n"
        f"{guidance or '(none)'}\n\n"
        "STRICT RULES\n"
        "- Use EXACT section order & headings from the system prompt.\n"
        "- Put the CONTACT BLOCK at the top, unchanged, only once.\n"
        "- Do NOT invent missing facts; omit empty sections entirely.\n"
        "- Use strong, quantified bullets where evidence exists.\n"
        "- Keep output clean, readable, and ATS-compliant.\n"
    )

def _cover_prompt(contact_block: str, sections: dict, role: str, company: str, guidance: str, today_str: str) -> str:
    return (
        "CONTACT BLOCK\n"
        f"{contact_block}\n\n"
        f"{today_str}\n\n"
        "TARGET ROLE / COMPANY\n"
        f"Role: {role or '(unspecified)'}\n"
        f"Company: {company or '(not specified)'}\n\n"
        "CANDIDATE EVIDENCE (use only what's present; do not invent)\n"
        f"SUMMARY:\n{sections.get('summary','')}\n\n"
        f"KEY SKILLS:\n{sections.get('skills','')}\n\n"
        f"EXPERIENCE EXCERPTS:\n{sections.get('experience','')}\n\n"
        f"PROJECTS:\n{sections.get('projects','')}\n\n"
        "GUIDANCE (job description or notes):\n"
        f"{guidance or '(none)'}\n\n"
        "STRICT RULES\n"
        "- Start with CONTACT (unchanged), then DATE, then GREETING.\n"
        "- 3–5 short paragraphs with specific wins/tools.\n"
        "- Close with 'Sincerely,' and the contact-block name.\n"
        "- No placeholders; never invent details.\n"
    )

def render_resume_text(contact_block: str, sections: dict, role: str, guidance: str) -> str:
    prompt = _resume_prompt(contact_block, sections, role, guidance)
    text = _call_openai(RESUME_SYSTEM, prompt)
    text = _force_contact_on_top(contact_block, text) if contact_block else text
    text = _dedupe_contact_block(contact_block, text)
    return squeeze_blank_lines(text)

def render_cover_text(contact_block: str, sections: dict, role: str, company: str, guidance: str, today_str: str) -> str:
    prompt = _cover_prompt(contact_block, sections, role, company, guidance, today_str)
    text = _call_openai(COVER_SYSTEM, prompt)
    text = _force_contact_on_top(contact_block, text) if contact_block else text
    text = _dedupe_contact_block(contact_block, text)
    return squeeze_blank_lines(text)

# =========================
#        ROUTER
# =========================
router = APIRouter(tags=["Resume & Cover Generator"])

@router.post("/resume-cover")
def generate_resume_cover(
    payload: dict = Body(...),                     # accept plain dict to avoid model parsing issues
    authorization: Optional[str] = Header(None, alias="Authorization"),
):
    """
    Public: Generates resume and/or cover text in strict ATS-friendly format.
    If `useProfile` is true, a valid Bearer token is REQUIRED to pull the user's Profile.
    Supports per-run `overrides` for any field.
    """
    try:
        # Inputs (support both camelCase and snake_case)
        doc_type  = str(payload.get("doc_type") or payload.get("docType") or "both").lower()
        guidance  = _pick(payload.get("guidance"), payload.get("jobDescription"), payload.get("jd"), payload.get("notes"))
        company   = _pick(payload.get("company"), payload.get("companyName"), payload.get("employer"))
        overrides: Dict[str, Any] = payload.get("overrides") or {}
        use_profile = bool(payload.get("useProfile") or payload.get("use_profile") or payload.get("include_profile", False))

        # Role: explicit -> derive from guidance -> empty
        role = _pick(payload.get("role_or_target"), payload.get("role"), payload.get("targetRole"), payload.get("title"))
        if not role:
            role = _derive_role_from_guidance(guidance)

        # Auth / profile loading
        user: Optional[User] = None
        profile: Optional[Profile] = None
        if use_profile:
            # require token if they asked to use profile
            if not authorization or not authorization.lower().startswith("bearer "):
                raise HTTPException(status_code=401, detail="useProfile=true requires Authorization Bearer token")

            # ✅ open a REAL session; do NOT pass get_db() generator
            db = SessionLocal()
            try:
                user = get_current_user(authorization=authorization, db=db)
                profile = _fetch_profile(db, user.id)
                if not profile:
                    raise HTTPException(status_code=404, detail="Profile not found for user")
            finally:
                db.close()
        else:
            # Optional token → we can still detect the user (but we don't pull profile unless requested)
            user = get_optional_user(authorization=authorization)

        # Contact + sections
        contact_block = _format_contact_block(profile, user) if (user and profile) else ""
        base_sections = _profile_sections(profile) if profile else {}
        merged_sections = _merge_sections(base_sections, overrides)

        today_str = _dt.date.today().strftime("%B %d, %Y")
        target = doc_type if doc_type in ("resume", "cover", "both") else "both"

        resume_text = cover_text = None
        if target in ("resume", "both"):
            resume_text = render_resume_text(contact_block, merged_sections, role, guidance)
        if target in ("cover", "both"):
            cover_text  = render_cover_text(contact_block, merged_sections, role, company, guidance, today_str)

        return {
            "ok": True,
            "doc_type": target,
            "resume_text": resume_text,
            "cover_text": cover_text,
            "model_used": ("openai" if USE_AI else "local-fallback"),
            "timestamp": _dt.datetime.utcnow().isoformat() + "Z",
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Generator error: {e!s}")

# =========================
#        SAVE ROUTE
# =========================
@router.post("/resume-cover/save")
def save_resume_cover(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),   # PROTECTED
):
    """
    Save resume and/or cover into the Resume table (same store for both),
    labeled via `source` so 'My Resumes' can show both.
    """
    doc_type = str(payload.get("doc_type", "resume")).lower()

    resume_id: Optional[int] = None
    cover_id: Optional[int] = None

    # Save resume row
    if doc_type in ("resume", "both"):
        resume_title = (payload.get("resume_title") or "").strip()
        resume_text = (payload.get("resume_text") or "").strip()
        if not resume_title or not resume_text:
            raise HTTPException(status_code=422, detail="Missing resume_title or resume_text")
        r = Resume(
            title=resume_title,
            content=resume_text,
            source="resume",
            user_id=user.id,
        )
        db.add(r); db.commit(); db.refresh(r)
        resume_id = r.id

    # Save cover row
    if doc_type in ("cover", "both"):
        cover_title = (payload.get("cover_title") or "").strip()
        cover_text = (payload.get("cover_text") or "").strip()
        if not cover_title or not cover_text:
            raise HTTPException(status_code=422, detail="Missing cover_title or cover_text")
        c = Resume(
            title=cover_title,
            content=cover_text,
            source="cover",
            user_id=user.id,
        )
        db.add(c); db.commit(); db.refresh(c)
        cover_id = c.id

    return {"ok": True, "resume_id": resume_id, "cover_id": cover_id}
