# backend/utils/text_normalize.py
import re

# keep +, #, /, &, . because they appear in tech terms (C++, C#, REST, Node.js)
_PUNCT_RE = re.compile(r"[^\w\s\+\#/&\.-]")
_SPACE_RE = re.compile(r"\s+")
# de-hyphenate words like "end-to-end", "data-driven"
_DEHYPHEN_RE = re.compile(r"(\w)[\-–—](\w)")

def normalize(s: str) -> str:
    """Lowercases, de-hyphenates, keeps tech punctuation, trims spaces."""
    s = s.lower()
    s = _DEHYPHEN_RE.sub(r"\1 \2", s)
    # common canonicalizations
    s = s.replace("e commerce", "ecommerce e commerce")
    s = s.replace("end to end", "end-to-end end to end")
    s = _PUNCT_RE.sub(" ", s)
    s = _SPACE_RE.sub(" ", s).strip()
    return s
