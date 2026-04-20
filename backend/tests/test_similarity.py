import logging
from typing import Dict, Set
from backend.constants import SKILLS_SET, STOP_WORDS

logger = logging.getLogger(__name__)

def compute_similarity(resume_text: str, jd_text: str, comparison_type: str = "word") -> Dict[str, object]:
    resume_tokens = set(resume_text.lower().split()) - STOP_WORDS
    jd_tokens = set(jd_text.lower().split()) - STOP_WORDS

    logger.debug(f"Comparison type: {comparison_type}")
    logger.debug(f"Resume tokens: {resume_tokens}")
    logger.debug(f"JD tokens: {jd_tokens}")

    if comparison_type == "word":
        matched, unmatched = compare_by_word(resume_tokens, jd_tokens)
    elif comparison_type == "skill":
        matched, unmatched = compare_by_skill(resume_tokens, jd_tokens)
    elif comparison_type == "overall":
        matched, unmatched = compare_by_overall(resume_tokens, jd_tokens)
    else:
        logger.error(f"Unknown comparison type: {comparison_type}")
        raise ValueError(f"Unknown comparison type: '{comparison_type}'")

    match_percentage = round(len(matched) / len(jd_tokens) * 100, 2) if jd_tokens else 0.0

    logger.debug(f"Matched keywords: {matched}")
    logger.debug(f"Unmatched keywords: {unmatched}")
    logger.debug(f"Match percentage: {match_percentage}")

    return {
        "match_percentage": match_percentage,
        "matched_keywords": sorted(list(matched))[:10],
        "unmatched_keywords": sorted(list(unmatched))[:10],
    }
