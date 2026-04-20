# backend/routes/parse.py
from __future__ import annotations

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional, List, Dict, Any, Set, Tuple
import re
import asyncio
import unicodedata
from rapidfuzz import process, fuzz

# Reuse your existing extractor (pdf/docx/txt) from compare route
from backend.routes.compare import extract_text
from backend.constants import SKILLS_SET, STOP_WORDS

router = APIRouter(prefix="/parse", tags=["Parse"])

# ---------------- parser-friendly normalization ----------------
_dehyphen_linebreak_re = re.compile(r"(\w)-\s*\n\s*(\w)")
_multispace_re = re.compile(r"[ \t\f\v]+")  # keep newlines intact


def _normalize_for_parsing(s: str) -> str:
    """
    Keep newlines and email chars; collapse spaces/tabs per line; lowercase.
    Different from the compare normalizer because the parser must preserve
    section breaks and emails (with '@', '.', '+', etc.).
    """
    if not s:
        return ""
    s = unicodedata.normalize("NFC", s)
    # dehyphenate only when broken across linebreaks (e.g., "machine-\nlearning")
    s = _dehyphen_linebreak_re.sub(r"\1 \2", s)
    # unify EOLs
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    # collapse spaces/tabs per line, but keep '\n'
    s = "\n".join(_multispace_re.sub(" ", ln).strip() for ln in s.split("\n"))
    return s.lower().strip()


# ---------------- regex/heuristics ----------------
EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.I)
# fallback for "name at domain dot com" style obfuscations
EMAIL_FALLBACK = re.compile(
    r"\b([a-z0-9._%+-]+)\s*(?:@| at )\s*([a-z0-9.-]+)\s*(?:\.| dot )\s*([a-z]{2,})\b",
    re.I,
)

# 7–15 digits, optional country code; tolerates punctuation
PHONE_RE = re.compile(
    r"(?:\+?\d{1,3}[\s\-\.]?)?(?:\(?\d{3}\)?[\s\-\.]?)?\d{3}[\s\-\.]?\d{4}"
)

NAME_LINE_RE = re.compile(r"^[a-z ,.'\-]+$", re.I)  # crude but effective for top lines

# Section heading detector (handles uppercase too)
SEC_HEAD_RE = re.compile(
    r"^\s*(education|work experience|professional experience|experience|employment|career history|academics|academic background|qualifications|projects)\s*:?\s*$",
    re.I,
)

EDU_KEYS = ("education", "qualifications", "academics", "academic background", "coursework")
EXP_KEYS = ("experience", "work experience", "professional experience", "employment", "career history")

# --- date & section parsing helpers ---
MONTH_RE = (
    r"(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|"
    r"january|february|march|april|june|july|august|september|october|november|december)"
)
DATE_RANGE_RE = re.compile(
    rf"\b(?:{MONTH_RE}\s+)?(19|20)\d{{2}}\s*[–—\-]\s*(?:present|(?:{MONTH_RE}\s+)?(19|20)\d{{2}})\b",
    re.I,
)

BULLET_RE = re.compile(r"^[\u2022\u2023\u25E6\u2043\-•●]\s+")
UPPER_HEADING_RE = re.compile(r"^[A-Z][A-Z\s&/.\-]+$")


def _first_nonempty_lines(text: str, n: int = 8) -> List[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()][:n]


def _guess_name(text: str) -> Optional[str]:
    # Look at the first few lines for a name-like single line (no @, no digits)
    for ln in _first_nonempty_lines(text, 8):
        if ("@" in ln) or re.search(r"\d", ln):
            continue
        if 2 <= len(ln.split()) <= 6 and NAME_LINE_RE.match(ln):
            # Title-case but keep small particles
            parts = []
            for w in ln.split():
                lw = w.lower()
                parts.append(w.title() if lw not in {"of", "and", "the", "da", "de", "van", "von"} else lw)
            return " ".join(parts)
    return None


def _extract_email(text: str) -> Optional[str]:
    m = EMAIL_RE.search(text)
    if m:
        return m.group(0).lower()
    f = EMAIL_FALLBACK.search(text)
    if f:
        return f"{f.group(1)}@{f.group(2)}.{f.group(3)}".lower()
    return None


def _extract_phone(text: str) -> Optional[str]:
    m = PHONE_RE.search(text)
    if not m:
        return None
    num = re.sub(r"[^\d+]", "", m.group(0))
    # normalize to E.164-ish
    if num.startswith("+") and 8 <= len(re.sub(r"\D", "", num)) <= 15:
        return num
    digits = re.sub(r"\D", "", num)
    if len(digits) == 10:  # assume US
        return f"+1{digits}"
    if 8 <= len(digits) <= 15:
        return f"+{digits}"
    return None


def _tokenize(text_norm: str) -> List[str]:
    return [t for t in text_norm.split() if t and t not in STOP_WORDS]


def _match_multiword_skills(text: str) -> Set[str]:
    """
    Match multi-word skills from SKILLS_SET against the full text (normalized),
    so we capture 'machine learning' instead of split tokens.
    """
    hits = set()
    phrases = [s for s in SKILLS_SET if " " in s]
    for p in phrases:
        # word-boundary-ish check; text is lowercased already
        if re.search(rf"\b{re.escape(p)}\b", text):
            hits.add(p)
    return hits


def _fuzzy_fill_skills(tokens: Set[str], base: List[str], top_k: int = 80, thresh: int = 92) -> List[str]:
    """
    Optional fuzzy to catch minor variants (e.g., 'java script' ~ 'javascript').
    """
    have = set(base)
    # limit candidates for speed
    cand = list(SKILLS_SET - have)
    token_list = list(tokens)
    for t in token_list[:top_k]:
        b = process.extractOne(t, cand, scorer=fuzz.QRatio)
        if b and b[1] >= thresh:
            have.add(b[0])
    return sorted(have)


def _consolidate_skills(skills: List[str]) -> List[str]:
    """
    Keep multi-word skills; drop single-word skills that are contained within any matched phrase.
    Example: drop 'machine' if 'machine learning' is present.
    """
    skills = [s.strip() for s in skills if s and s.strip()]
    phrases = [s for s in skills if " " in s]
    singles = [s for s in skills if " " not in s]
    singles = [s for s in singles if not any(f" {s} " in f" {p} " for p in phrases)]
    return sorted(set(phrases + singles))


def _section_blocks(text: str, keys: Tuple[str, ...]) -> List[str]:
    """
    Split text by headings. For blocks that START with any of `keys`,
    END at the next heading of ANY kind (so 'Experience' stops at 'Education').
    """
    lines = text.splitlines()

    # all headings (any type)
    all_head_idxs: List[int] = []
    for i, ln in enumerate(lines):
        if SEC_HEAD_RE.match(ln):
            all_head_idxs.append(i)

    # candidate starts (only those matching the requested keys)
    start_idxs: List[int] = []
    for i, ln in enumerate(lines):
        if SEC_HEAD_RE.match(ln) and any(k in ln.lower() for k in keys):
            start_idxs.append(i)

    blocks: List[str] = []
    for start in start_idxs:
        # find first heading AFTER start
        end = None
        for h in all_head_idxs:
            if h > start:
                end = h
                break
        if end is None:
            end = len(lines)
        block = "\n".join(lines[start:end]).strip()
        if block:
            blocks.append(block)
    return blocks


def _is_company_header(line: str) -> bool:
    # Heuristic: contains an em/en dash and a date range OR looks like ALL CAPS org line
    l = line.strip()
    return (("—" in l or "–" in l) and bool(DATE_RANGE_RE.search(l))) or (UPPER_HEADING_RE.match(l) is not None)


def _clean_line(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip(" ·-–—")


def _split_company_header(line: str) -> Dict[str, Optional[str]]:
    """
    Parse lines like:
      'The Home Depot — Atlanta, GA, USA Feb 2025 – Present'
      'BeeData Technology — Hyderabad, India Jan 2020 – Dec 2022'
    Returns company, location, start, end if found.
    """
    s = line.strip(" -–—")
    # capture date range
    m = DATE_RANGE_RE.search(s)
    start, end = None, None
    if m:
        rng = m.group(0)
        parts = re.split(r"[–—\-]", rng, maxsplit=1)
        start = parts[0].strip()
        end = (parts[1] or "").strip() if len(parts) > 1 else None
        s = s[:m.start()].rstrip(", ").strip()

    # company — location
    parts = re.split(r"\s*[–—]\s*", s, maxsplit=1)
    company = parts[0].strip() if parts else s
    location = parts[1].strip() if len(parts) > 1 else None
    return {"company": company or None, "location": location, "start": start, "end": end}


def _parse_experience_block(block: str) -> List[Dict[str, Any]]:
    """
    Structured roles from an Experience section.
    Supports:
      A) Company header → Title → Bullets
      B) Title → Company header → Bullets
    """
    lines = [ln for ln in block.splitlines() if ln.strip()]
    if not lines:
        return []
    lines = lines[1:]  # drop the "Experience" heading itself

    entries: List[Dict[str, Any]] = []
    cur: Dict[str, Any] = {}
    expecting_title = False
    pending_title: Optional[str] = None

    for idx, raw in enumerate(lines):
        line = raw.strip()

        # If this line is a company header
        if _is_company_header(line):
            # Flush previous entry
            if cur:
                entries.append(cur)
            header = _split_company_header(line)
            cur = {
                "company": header["company"],
                "location": header["location"],
                "start": header["start"],
                "end": header["end"],
                "title": None,
                "bullets": [],
            }
            # If we had a pending title (title-first pattern), use it
            if pending_title:
                cur["title"] = _clean_line(pending_title)
                pending_title = None
                expecting_title = False
            else:
                expecting_title = True
            continue

        # Bullet lines
        if BULLET_RE.match(line):
            if not cur:
                # bullet without header/title; ignore
                continue
            cur.setdefault("bullets", []).append(_clean_line(BULLET_RE.sub("", line)))
            continue

        # Non-bullet, non-header line:
        # 1) If we *expect* a title immediately after a header (pattern A)
        if expecting_title and cur:
            cur["title"] = _clean_line(line)
            expecting_title = False
            continue

        # 2) Otherwise, prefer treating as a continuation (of last bullet or title)
        continued = False
        if cur.get("bullets"):
            cur["bullets"][-1] = _clean_line(cur["bullets"][-1] + " " + line)
            continued = True
        elif cur.get("title"):
            cur["title"] = _clean_line(f"{cur['title']} {line}")
            continued = True
        if continued:
            continue

        # 3) Title‑first heuristic (pattern B): short-ish line, no digits, next line is header, and
        #    the line does NOT look like a sentence (no terminal punctuation).
        next_is_header = (idx + 1 < len(lines)) and _is_company_header(lines[idx + 1].strip())
        looks_like_title = len(line.split()) <= 8 and not re.search(r"\d", line)
        if next_is_header and looks_like_title and not line.endswith(('.', '!', '?', ':', ';')):
            pending_title = line
            continue

        # Otherwise: ignore stray text

    if cur:
        entries.append(cur)
    return entries


# simple degree normalization (maps to bachelor/master/doctorate where obvious)
_DEGREE_MAP = {
    "bsc": "bachelor", "b.s": "bachelor", "bs": "bachelor", "be": "bachelor", "btech": "bachelor", "b.tech": "bachelor",
    "msc": "master", "m.s": "master", "ms": "master", "mtech": "master", "m.tech": "master", "mca": "master",
    "mba": "master",
    "phd": "doctorate", "ph.d": "doctorate",
    "bca": "bachelor",
}
DEGREE_HINT_RE = re.compile(
    r"\b(b\.?sc|b\.?s|b\.?e|btech|b\.?tech|m\.?sc|m\.?s|mtech|m\.?tech|mba|ph\.?d|bachelor|master|doctorate|ms|bs|mca|bca)\b",
    re.I,
)


def _normalize_degree_label(s: str) -> str:
    key = s.lower().replace(".", "").strip()
    return _DEGREE_MAP.get(key, s.strip().lower())


def _parse_education_block(block: str) -> List[Dict[str, Any]]:
    """
    Turn an 'Education' section into entries by pairing degree lines with school/location/dates lines.
    Handles 2-line patterns:
      Degree line
      School — Location dates
    """
    lines = [ln for ln in block.splitlines() if ln.strip()]
    if not lines:
        return []
    lines = lines[1:]  # drop heading

    out: List[Dict[str, Any]] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        deg = None
        deg_m = DEGREE_HINT_RE.search(line)
        if deg_m:
            deg = _normalize_degree_label(deg_m.group(0))
            # lookahead
            school, location, start, end, year = None, None, None, None, None
            if i + 1 < len(lines):
                nxt = lines[i + 1].strip()
                hdr = _split_company_header(nxt)  # reuse for school/location/dates
                school = hdr["company"]
                location = hdr["location"]
                start, end = hdr["start"], hdr["end"]
                # if no range, try a single year
                if not (start or end):
                    single = re.search(r"(19|20)\d{2}", nxt)
                    year = single.group(0) if single else None
                i += 1
            out.append({
                "degree": deg,
                "school": school,
                "location": location,
                "start": start,
                "end": end,
                "year": year,
            })
        else:
            # Some formats list school first, then degree
            hdr = _split_company_header(line)
            maybe_school = hdr["company"]
            has_year = bool(hdr["start"] or hdr["end"] or re.search(r"(19|20)\d{2}", line))
            if maybe_school and has_year and i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                deg_m2 = DEGREE_HINT_RE.search(next_line)
                if deg_m2:
                    out.append({
                        "degree": _normalize_degree_label(deg_m2.group(0)),
                        "school": maybe_school,
                        "location": hdr["location"],
                        "start": hdr["start"],
                        "end": hdr["end"],
                        "year": None,
                    })
                    i += 1
            # else ignore this stray line
        i += 1

    return out


# ---------------- route ----------------
@router.post("")
async def parse_resume(
    resume_file: Optional[UploadFile] = File(None, description="Resume file (.pdf/.docx/.txt)"),
    resume_text: Optional[str] = Form(None, description="Raw resume text"),
    fuzzy_skills: bool = Form(True, description="Use fuzzy matching to expand detected skills"),
) -> Dict[str, Any]:
    """
    Parse a resume (file or text) into structured fields.
    NOTE: Uses parser-specific normalization that preserves newlines & '@'.
    """
    if not resume_file and not (resume_text and resume_text.strip()):
        raise HTTPException(status_code=400, detail="Provide resume_file or resume_text")

    # 1) Get parser-friendly normalized text
    if resume_file:
        # extract_text returns normalized lowercase w/ newlines preserved;
        # we still pass through our parser normalizer for consistency.
        raw = await asyncio.to_thread(extract_text, resume_file)
        text_norm = _normalize_for_parsing(raw)
    else:
        text_norm = _normalize_for_parsing(resume_text or "")

    if not text_norm.strip():
        raise HTTPException(status_code=400, detail="No usable text in resume")

    # 2) Core fields
    name = _guess_name(text_norm)
    email = _extract_email(text_norm)
    phone = _extract_phone(text_norm)

    # 3) Skills (multi-word phrases first, then exact tokens, then optional fuzzy; consolidate)
    tokens = set(_tokenize(text_norm))
    phrase_skills = _match_multiword_skills(text_norm)
    # Exact single-token hits
    skills_exact = sorted(phrase_skills | (tokens & SKILLS_SET))
    skills = _fuzzy_fill_skills(tokens, skills_exact) if fuzzy_skills else skills_exact
    skills = _consolidate_skills(skills)

    # 4) Sections (heuristic; Experience stops at next heading)
    edu_blocks = _section_blocks(text_norm, EDU_KEYS)
    exp_blocks = _section_blocks(text_norm, EXP_KEYS)

    education = _parse_education_block(edu_blocks[0]) if edu_blocks else []
    experience = _parse_experience_block(exp_blocks[0]) if exp_blocks else []

    return {
        "name": name,
        "email": email,
        "phone": phone,
        "skills": skills,
        "education": education,
        "experience": experience,
        "raw_text": text_norm,  # keep for UI/debug; drop in prod if needed
    }
