import re
from datetime import datetime, timezone
from typing import Optional

ET_MAP = {
    "full time": "full-time",
    "full-time": "full-time",
    "fulltime": "full-time",
    "part time": "part-time",
    "part-time": "part-time",
    "contract": "contract",
    "contractor": "contract",
    "intern": "internship",
    "internship": "internship",
    "temporary": "temporary",
    "temp": "temporary",
}

def norm_employment_type(raw: Optional[str]) -> Optional[str]:
    """Normalize employment type string."""
    if not raw:
        return None
    s = raw.strip().lower()
    s = re.split(r"[·|,/]", s)[0].strip()  # first token
    for k, v in ET_MAP.items():
        if k in s:
            return v
    return None  # previously returned "other", now None to avoid skipping

def parse_ts(posted_at: Optional[str]) -> Optional[int]:
    """
    Convert posted_at string to epoch milliseconds.
    Supports ISO, yyyy-mm-dd, numeric timestamps, and relative strings.
    """
    if not posted_at:
        return None

    # numeric timestamps
    try:
        n = float(posted_at)
        if n >= 1e12:  # ms
            return int(n)
        if n >= 1e9:   # sec
            return int(n * 1000)
    except Exception:
        pass

    # ISO 8601
    try:
        dt = datetime.fromisoformat(posted_at.replace("Z", "+00:00"))
        return int(dt.timestamp() * 1000)
    except Exception:
        pass

    # simple date yyyy-mm-dd
    try:
        dt = datetime.strptime(posted_at, "%Y-%m-%d")
        dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    except Exception:
        pass

    # relative strings like '3 days ago', 'Just posted'
    try:
        posted_at = posted_at.lower().strip()
        from time import time
        now = int(time() * 1000)
        if "just posted" in posted_at:
            return now
        m = re.match(r"(\d+)\s+day", posted_at)
        if m:
            days_ago = int(m.group(1))
            return now - days_ago * 24 * 3600 * 1000
    except Exception:
        pass

    return None  # give up if unrecognized

def parse_salary_max(raw: Optional[str]) -> Optional[int]:
    """
    Extract maximum annual salary number from a string.
    Handles "$60k–$75k", "139000 - 150000", "£45,000", "90k", "100000".
    """
    if not raw:
        return None
    s = str(raw)
    s = re.sub(r"[^0-9kK\-\–]", " ", s)
    parts = re.split(r"[\-\–]", s)
    nums = []
    for p in parts:
        p = p.strip().replace(" ", "")
        if not p:
            continue
        m = re.fullmatch(r"(\d+)(k|K)?", p)
        if not m:
            continue
        val = int(m.group(1))
        if m.group(2):  # has k
            val *= 1000
        nums.append(val)
    if not nums:
        return None
    return max(nums)

def within_days(ts_ms: Optional[int], days: int, now_ms: Optional[int] = None) -> bool:
    """
    Check if timestamp ts_ms is within `days` from now.
    Returns True if ts_ms is None to avoid filtering out jobs with unknown dates.
    """
    if ts_ms is None:
        return True
    from time import time
    now = now_ms or int(time() * 1000)
    return (now - ts_ms) <= days * 24 * 3600 * 1000
