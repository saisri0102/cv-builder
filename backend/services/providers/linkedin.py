# backend/services/providers/linkedin.py
import os, httpx, logging, hashlib
from typing import List, Optional
from datetime import datetime, timedelta
from backend.schemas.jobs import JobItem

log = logging.getLogger("jobs.providers.linkedin")

HOST = os.getenv("LINKEDIN_RAPIDAPI_HOST", "linkedin-jobs-search.p.rapidapi.com")
PATH = os.getenv("LINKEDIN_RAPIDAPI_PATH", "/search")  # many variants use /search; some use /jobs/search
if not PATH.startswith("/"):
    PATH = "/" + PATH
BASE_URL = f"https://{HOST}"

def _map_posted_within(v: Optional[str]) -> Optional[str]:
    if not v: return None
    s = str(v).strip().lower()
    if s in {"1","24","24h","day","today"}: return "past-24-hours"
    if s in {"7","7d","week"}:              return "past-week"
    if s in {"30","30d","month"}:           return "past-month"
    return None

def _bool_remote_from_row(row: dict) -> Optional[bool]:
    txt = " ".join([
        str(row.get("workplaceType") or ""),
        str(row.get("title") or row.get("jobTitle") or ""),
        str(row.get("location") or row.get("jobLocation") or ""),
        str(row.get("description") or ""),
    ]).lower()
    if any(w in txt for w in ["remote", "work from home", "wfh", "hybrid"]): return True
    if any(w in txt for w in ["on-site", "on site", "onsite"]):              return False
    return None

def _mk_id(title: str, company: str, location: str, url: str) -> str:
    base = f"{title}|{company}|{location}|{url}"
    return "linkedin-" + hashlib.sha1(base.encode("utf-8")).hexdigest()[:16]

def _parse_dt(s: Optional[str]) -> Optional[datetime]:
    if not s: return None
    try:
        # Many variants ship ISO 8601; tolerate 'Z'
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except Exception:
        return None

def _within_days(posted_at_str: str, posted_within: Optional[str]) -> bool:
    if not posted_within or not posted_at_str:
        return True
    dt = _parse_dt(posted_at_str)
    if not dt:
        return True
    now = datetime.utcnow().replace(tzinfo=dt.tzinfo)
    days_map = {"past-24-hours": 1, "past-week": 7, "past-month": 30}
    limit = days_map.get(_map_posted_within(posted_within) or "", 0)
    return (now - dt) <= timedelta(days=limit) if limit else True

async def fetch_linkedin_jobs(
    client: httpx.AsyncClient,
    *,
    query: str,
    location: Optional[str],
    remote: Optional[bool] = False,
    page: int = 1,
    per_page: int = 20,
    employment_type: Optional[str] = None,
    posted_within: Optional[str] = None,
) -> List[JobItem]:
    """Fetch jobs from LinkedIn via RapidAPI (supports common POST/GET variants)."""
    RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
    if not RAPIDAPI_KEY:
        log.warning("No RAPIDAPI_KEY for LinkedIn")
        return []

    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": HOST,
        "Accept": "application/json",
    }

    # Location: some APIs accept empty; others require a string
    loc = (location or ("remote" if remote else "")).strip()

    # Provider-side filters (best effort; harmless if the API ignores these keys)
    lpw = _map_posted_within(posted_within)
    params_or_body = {
        "keywords": (query or "software engineer"),
        "location": loc,
        "page": max(1, int(page or 1)),
        "num_pages": 1,  # fetch exactly one LinkedIn page
    }
    if lpw:
        # Many variants accept this name; some use `datePosted`
        params_or_body["datePosted"] = lpw
    if remote:
        # Some variants accept a boolean flag for remote filtering
        params_or_body["remoteFilter"] = True

    # Try POST first (common), then GET with /jobs/search (alternate)
    urls = [
        (f"{BASE_URL}{PATH}", "POST"),
        (f"{BASE_URL}/jobs/search", "GET")
    ]

    data = None
    for url, method in urls:
        try:
            if method == "POST":
                r = await client.post(url, headers=headers, json=params_or_body, timeout=30)
            else:
                # Convert numeric/bools to strings to be safe in query
                qp = {k: (str(v).lower() if isinstance(v, bool) else str(v)) for k, v in params_or_body.items()}
                r = await client.get(url, headers=headers, params=qp, timeout=30)

            if r.status_code == 404:
                # path mismatch; try next
                log.info("LinkedIn 404 on %s %s; trying alternative path.", method, url)
                continue
            r.raise_for_status()
            data = r.json()
            break
        except httpx.HTTPStatusError as e:
            body = ""
            try: body = e.response.text[:400]
            except Exception: pass
            if getattr(e.response, "status_code", 0) in (401, 403) and "not subscribed" in (body or "").lower():
                log.error("LinkedIn: not subscribed to %s. Subscribe to this exact RapidAPI API/host.", HOST)
                return []
            log.error("LinkedIn %s %s -> %s %s", method, url, getattr(e.response, "status_code", "?"), body)
        except Exception as e:
            log.warning("LinkedIn request error on %s %s: %s", method, url, e)

    if data is None:
        return []

    # Normalize rows
    rows = []
    if isinstance(data, list):
        rows = data
    elif isinstance(data, dict):
        rows = data.get("data") or data.get("results") or data.get("jobs") or []
    if not isinstance(rows, list):
        rows = []

    items: List[JobItem] = []
    for row in rows:
        # Common field variants
        title = (row.get("title") or row.get("jobTitle") or "").strip()
        company = (row.get("company") or row.get("companyName") or "").strip()
        loc_out = (row.get("location") or row.get("jobLocation") or "").strip()
        url_out = (row.get("url") or row.get("jobUrl") or "").strip()
        desc = row.get("description") or ""
        etype = (row.get("employmentType") or row.get("jobEmploymentType") or "").strip().lower() or None
        posted_at = str(row.get("postedAt") or row.get("listedAt") or row.get("date") or "")

        # Optional: client-side filters if provider ignores parameters
        if employment_type and etype and etype != employment_type.lower():
            continue
        if posted_within and not _within_days(posted_at, posted_within):
            continue

        # Remote flag heuristic
        remote_flag = _bool_remote_from_row(row)

        # Stable id
        native_id = row.get("id") or row.get("job_id")
        jid = str(native_id) if native_id else _mk_id(title, company, loc_out, url_out)

        items.append(JobItem(
            id=jid,
            source="linkedin",
            title=title,
            company=company,
            location=loc_out,
            description=desc,
            url=url_out,
            employment_type=etype,
            posted_at=posted_at,
            remote=remote_flag,
        ))

    log.info("LinkedIn returned %d items", len(items))
    return items[: max(1, int(per_page or 20))]
