# backend/utils/similarity.py
from typing import Dict, Tuple, Set, List, Optional
from functools import lru_cache
from os import getenv

from rapidfuzz import fuzz, process

from backend.utils.text_normalize import normalize
from backend.constants import SKILLS_SET as RAW_SKILLS, STOP_WORDS as RAW_STOP, PHRASES as RAW_PHRASES, SYNONYMS as RAW_SYNS

# =========================
# Env-tunable knobs (safe defaults)
# =========================
DEFAULT_STRICT = 92
DEFAULT_TOKEN_STRICT = 88
DEFAULT_LOOSE = 82
STRICT = int(getenv("FUZZ_STRICT", str(DEFAULT_STRICT)))
TOKEN_STRICT = int(getenv("FUZZ_TOKEN_STRICT", str(DEFAULT_TOKEN_STRICT)))
LOOSE = int(getenv("FUZZ_LOOSE", str(DEFAULT_LOOSE)))

# Phrase fuzzy thresholds
PHRASE_STRICT = int(getenv("PHRASE_STRICT", "90"))
PHRASE_LOOSE = int(getenv("PHRASE_LOOSE", "84"))

# Overall weights
W_SKILL = float(getenv("W_SKILL", "2.0"))
W_PHRASE = float(getenv("W_PHRASE", "2.0"))
W_WORD = float(getenv("W_WORD", "1.0"))

# Optional semantic (embeddings) blend
USE_EMBED = getenv("USE_EMBED", "false").lower() in {"1", "true", "yes"}
BASE_WEIGHT = float(getenv("BASE_WEIGHT", "0.4"))   # weight for deterministic score
EMBED_WEIGHT = float(getenv("EMBED_WEIGHT", "0.6")) # weight for semantic score

# Synonym expansion safety caps
MAX_SYNONYM_HOPS = int(getenv("MAX_SYNONYM_HOPS", "1"))   # transitive expansion depth
MAX_SYNONYM_SIZE = int(getenv("MAX_SYNONYM_SIZE", "2000"))  # hard cap on expanded token set size

# Phrase fuzzy windowing to reduce false positives
PHRASE_WINDOW = int(getenv("PHRASE_WINDOW", "16"))   # token-window size to compare against
PHRASE_STEP = int(getenv("PHRASE_STEP", "4"))        # step size when sliding window

# Default list size for UI
DEFAULT_TOP_N = int(getenv("TOP_N_KEYWORDS", "40"))


# =========================
# Normalize dictionaries once (speed + correctness)
# =========================
def _norm(s: str) -> str:
    return normalize(s or "")

STOP_WORDS: Set[str] = {_norm(x) for x in RAW_STOP if x}
SKILLS_SET: Set[str] = {_norm(x) for x in RAW_SKILLS if x}
PHRASES: Set[str] = {_norm(x) for x in RAW_PHRASES if x}

SYNONYMS: Dict[str, Set[str]] = {}
for k, vals in RAW_SYNS.items():
    nk = _norm(k)
    if not nk:
        continue
    bucket = SYNONYMS.setdefault(nk, set())
    for v in vals:
        nv = _norm(v)
        if nv and nv != nk:
            bucket.add(nv)


# =========================
# Helpers
# =========================
def _tokenize_words(text: str) -> List[str]:
    """Simple whitespace tokenization AFTER normalize(); filters stopwords."""
    return [t for t in text.split() if t and t not in STOP_WORDS]


def _extract_phrases(text: str, phrases: Set[str]) -> Set[str]:
    """
    Exact phrase hits in normalized text.
    Use along with fuzzy phrase matching to catch close variants.
    """
    if not phrases or not text:
        return set()
    return {p for p in phrases if p and p in text}


def _expand_synonyms(tokens: Set[str]) -> Set[str]:
    """
    Bounded synonym expansion to avoid explosion.
    """
    if not tokens:
        return set()
    expanded = set(tokens)
    for _ in range(max(0, MAX_SYNONYM_HOPS)):
        new_items = set()
        for t in list(expanded):
            for v in SYNONYMS.get(t, ()):
                if v not in expanded:
                    new_items.add(v)
        if not new_items:
            break
        expanded |= new_items
        if len(expanded) >= MAX_SYNONYM_SIZE:
            break
    return expanded


@lru_cache(maxsize=4096)
def _best_fuzzy_match_cached(term: str, candidates_tuple: tuple) -> Tuple[str, int, str]:
    """
    Cached best candidate for `term` among candidates using multiple scorers.
    Returns (best_word, best_score, scorer_name).
    """
    candidates = list(candidates_tuple)
    best_word, best_score, best_who = "", 0, ""

    b = process.extractOne(term, candidates, scorer=fuzz.QRatio)
    if b:
        best_word, best_score, best_who = b[0], int(b[1]), "qratio"

    b = process.extractOne(term, candidates, scorer=fuzz.token_set_ratio)
    if b and int(b[1]) > best_score:
        best_word, best_score, best_who = b[0], int(b[1]), "token_set"

    b = process.extractOne(term, candidates, scorer=fuzz.partial_ratio)
    if b and int(b[1]) > best_score:
        best_word, best_score, best_who = b[0], int(b[1]), "partial"

    return best_word, best_score, best_who


def _match_with_fuzz(source: Set[str], target: Set[str]) -> Tuple[Set[str], Set[str]]:
    """
    For each item in target, see if there's a strong fuzzy match in source.
    Returns (matched_in_target, unmatched_in_target)
    """
    matched, unmatched = set(), set()
    if not target:
        return matched, unmatched
    if not source:
        return matched, set(target)

    # Use cached matcher by passing an immutable snapshot of the source
    source_tuple = tuple(sorted(source))
    for t in target:
        if t in source:
            matched.add(t)
            continue
        _, score, who = _best_fuzzy_match_cached(t, source_tuple)
        ok = (
            (who == "qratio" and score >= STRICT) or
            (who == "token_set" and score >= TOKEN_STRICT) or
            (who == "partial" and score >= LOOSE)
        )
        (matched if ok else unmatched).add(t)
    return matched, unmatched


def _fuzzy_phrase_hits_windowed(resume_text_norm: str, jd_phrases: Set[str]) -> Tuple[Set[str], Set[str]]:
    """
    Fuzzy phrase matching by scanning windows of the resume text (reduces false positives
    vs comparing against the entire resume body).
    """
    if not jd_phrases:
        return set(), set()

    r_toks = resume_text_norm.split()
    if not r_toks:
        return set(), set(jd_phrases)

    matched, unmatched = set(), set()
    n = len(r_toks)

    for phrase in jd_phrases:
        if not phrase:
            continue
        if phrase in resume_text_norm:
            matched.add(phrase)
            continue

        # approximate phrase length by token count
        plen = max(2, len(phrase.split()))
        window = max(PHRASE_WINDOW, plen + 6)
        step = max(1, min(PHRASE_STEP, window))  # guard

        hit = False
        # slide over resume tokens
        for i in range(0, max(1, n - window + 1), step):
            chunk = " ".join(r_toks[i:i + window])
            # fast checks first
            sc_q = fuzz.QRatio(phrase, chunk)
            if sc_q >= PHRASE_STRICT:
                hit = True
                break
            sc_p = fuzz.partial_ratio(phrase, chunk)
            if sc_p >= PHRASE_LOOSE:
                hit = True
                break
        if hit:
            matched.add(phrase)
        else:
            unmatched.add(phrase)

    return matched, unmatched


def _compute_sets(resume_text: str, jd_text: str) -> Tuple[Set[str], Set[str], Set[str], Set[str], str, str]:
    """
    Normalize, tokenize, expand synonyms and extract phrases.
    Returns:
      resume_tokens, jd_tokens, resume_phrases, jd_phrases, norm_resume, norm_jd
    """
    norm_resume = normalize(resume_text or "")
    norm_jd = normalize(jd_text or "")

    resume_tokens = set(_tokenize_words(norm_resume))
    jd_tokens = set(_tokenize_words(norm_jd))

    # phrases (exact matches)
    resume_phrases = _extract_phrases(norm_resume, PHRASES)
    jd_phrases = _extract_phrases(norm_jd, PHRASES)

    # expand synonyms (bounded) for both sides
    resume_tokens = _expand_synonyms(resume_tokens)
    jd_tokens = _expand_synonyms(jd_tokens)

    return resume_tokens, jd_tokens, resume_phrases, jd_phrases, norm_resume, norm_jd


def _stable_keywords_list(items: Set[str], limit: Optional[int]) -> List[str]:
    """
    Deterministic, user-friendly ordering:
      1) longer strings first (tend to be more informative), then
      2) alphabetical.
    """
    ordered = sorted(items, key=lambda s: (-len(s), s))
    if limit is not None and limit >= 0:
        return ordered[:limit]
    return ordered


def _semantic_percent(norm_resume: str, norm_jd: str) -> Optional[float]:
    """
    Compute a 0–100 'semantic' similarity percent using local embeddings.
    Returns None if embeddings are disabled or unavailable.
    """
    if not USE_EMBED:
        return None
    try:
        # Lazy import so that environments without sentence-transformers still work
        from backend.utils.embeddings import embed, cosine
        v = embed([norm_resume, norm_jd])  # normalized embeddings
        sim = cosine(v[0], v[1])           # 0..1
        return float(max(0.0, min(1.0, sim)) * 100.0)
    except Exception:
        # Fail-safe: just don't apply semantic boost
        return None


# =========================
# Public API
# =========================
def compute_similarity(
    resume_text: str,
    jd_text: str,
    comparison_type: str = "word",
    *,
    top_n_keywords: Optional[int] = None,
    return_debug: bool = False,
) -> Dict[str, object]:
    """
    Compare resume vs JD and return a compact UI-friendly summary.

    Args:
      comparison_type: "word" | "skill" | "overall"
      top_n_keywords: if provided, trims matched/unmatched keyword lists
      return_debug: if True, includes category-wise details for inspection
    """
    (
        resume_tokens,
        jd_tokens,
        resume_phrases,
        jd_phrases,
        norm_resume,
        norm_jd,
    ) = _compute_sets(resume_text, jd_text)

    # Early guard — avoid division by zero & useless work
    if not jd_tokens and not jd_phrases:
        return {
            "match_percentage": 0.0,
            "matched_keywords": [],
            "unmatched_keywords": [],
        }

    # Word-level fuzzy
    matched_words, unmatched_words = _match_with_fuzz(resume_tokens, jd_tokens)

    # Phrase-level (exact + fuzzy with windowing)
    exact_phrase_matches = jd_phrases & resume_phrases
    jd_phrases_missing = jd_phrases - exact_phrase_matches
    fuzzy_phrase_matches, fuzzy_phrase_misses = _fuzzy_phrase_hits_windowed(norm_resume, jd_phrases_missing)

    matched_phrases = exact_phrase_matches | fuzzy_phrase_matches
    unmatched_phrases = fuzzy_phrase_misses  # whatever phrases still not found

    # Defaults for debug
    matched_skills: Set[str] = set()
    unmatched_skills: Set[str] = set()

    if comparison_type == "skill":
        # focus purely on skills (with fuzzy word matching boundaries)
        resume_skills = resume_tokens & SKILLS_SET
        jd_skills = jd_tokens & SKILLS_SET
        matched_skills, unmatched_skills = _match_with_fuzz(resume_skills, jd_skills)

        matched = matched_skills | matched_phrases
        desired = jd_skills | jd_phrases
        unmatched = desired - matched

        desired_count = len(desired)
        match_percentage = round((len(matched) / desired_count) * 100, 2) if desired_count else 0.0

    elif comparison_type == "overall":
        # combine skills + general words + phrases with WEIGHTS
        resume_skills = resume_tokens & SKILLS_SET
        jd_skills = jd_tokens & SKILLS_SET

        matched_skills, unmatched_skills = _match_with_fuzz(resume_skills, jd_skills)

        # Matches / desired sets
        matched = matched_words | matched_skills | matched_phrases
        desired_tokens = jd_tokens
        desired_phrases = jd_phrases
        desired_skills = jd_skills

        # Weighted score:
        score = (
            W_WORD * len(matched & desired_tokens)
            + W_SKILL * len(matched & desired_skills)
            + W_PHRASE * len(matched & desired_phrases)
        )
        total = (
            W_WORD * len(desired_tokens)
            + W_SKILL * len(desired_skills)
            + W_PHRASE * len(desired_phrases)
        )
        base_percent = round((score / total) * 100, 2) if total else 0.0

        # Optional semantic boost (embeddings)
        sem_percent = _semantic_percent(norm_resume, norm_jd)
        if sem_percent is not None:
            blended = BASE_WEIGHT * base_percent + EMBED_WEIGHT * sem_percent
            match_percentage = round(max(0.0, min(100.0, blended)), 2)
        else:
            match_percentage = base_percent

        unmatched = (desired_tokens | desired_phrases | desired_skills) - matched

    else:  # "word" — words + phrases (equal weight)
        matched = matched_words | matched_phrases
        desired = jd_tokens | jd_phrases
        unmatched = desired - matched

        desired_count = len(desired)
        match_percentage = round((len(matched) / desired_count) * 100, 2) if desired_count else 0.0

        # For debug symmetry
        resume_skills = resume_tokens & SKILLS_SET
        jd_skills = jd_tokens & SKILLS_SET
        matched_skills, unmatched_skills = _match_with_fuzz(resume_skills, jd_skills)

    # Clamp just in case any float wobble
    match_percentage = max(0.0, min(100.0, match_percentage))

    # UI-friendly lists (default-cap to keep payloads small)
    cap = DEFAULT_TOP_N if top_n_keywords is None else top_n_keywords
    matched_list = _stable_keywords_list(matched, cap)
    unmatched_list = _stable_keywords_list(unmatched, cap)

    out: Dict[str, object] = {
        "match_percentage": match_percentage,
        "matched_keywords": matched_list,
        "unmatched_keywords": unmatched_list,
    }

    if return_debug:
        debug: Dict[str, object] = {
            "matched_words": _stable_keywords_list(matched_words, cap),
            "unmatched_words": _stable_keywords_list(unmatched_words, cap),
            "matched_skills": _stable_keywords_list(matched_skills, cap),
            "unmatched_skills": _stable_keywords_list(unmatched_skills, cap),
            "matched_phrases": _stable_keywords_list(matched_phrases, cap),
            "unmatched_phrases": _stable_keywords_list(unmatched_phrases, cap),
        }
        if comparison_type == "overall":
            debug["base_percent"] = float(base_percent) if "base_percent" in locals() else None
            debug["semantic_percent"] = float(sem_percent) if "sem_percent" in locals() else None
        out["debug"] = debug

    return out
