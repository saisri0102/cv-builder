# backend/services/providers/jsearch.py
import os
import math
import logging
import asyncio
import hashlib
from typing import List, Optional
import httpx

from backend.schemas.jobs import JobItem

log = logging.getLogger("jobs.jsearch")

# --------------------------
# Env / Tunables
# --------------------------
# Prefer RAPIDAPI_* so it matches your .env; fall back to JSEARCH_*
HOST = os.getenv("RAPIDAPI_HOST") or os.getenv("JSEARCH_RAPIDAPI_HOST", "jsearch.p.rapidapi.com")
PATH = os.getenv("RAPIDAPI_PATH") or os.getenv("JSEARCH_RAPIDAPI_PATH", "/search")
if not str(PATH).startswith("/"):
    PATH = "/" + str(PATH)
KEY = os.getenv("RAPIDAPI_KEY", "")

# JSearch typically ~10 items/page
PAGE_SIZE = int(os.getenv("JSEARCH_PAGE_SIZE", "10"))
# How many JSearch pages to fetch per request (min preload)
PRELOAD_PAGES = int(os.getenv("JSEARCH_PRELOAD_PAGES", "1"))
# Safety cap per request
MAX_PAGES = int(os.getenv("JSEARCH_MAX_PAGES", "10"))
# Retries on transient errors
RETRIES_PER_URL = int(os.getenv("JSEARCH_RETRIES", "1"))
# HTTP timeout
TIMEOUT_SECS = float(os.getenv("JSEARCH_TIMEOUT_SECS", "30"))

BASE_URL = f"https://{HOST}{PATH}"


def _map_date_posted(posted_within: Optional[str]) -> Optional[str]:
    """UI → JSearch: today | 3days | week | month."""
    if not posted_within:
        return None
    s = str(posted_within).strip().lower()
    if s in {"1", "24", "24h", "day", "today"}: return "today"
    if s in {"3", "3d", "3days"}:               return "3days"
    if s in {"7", "7d", "week"}:                return "week"
    if s in {"30", "30d", "month"}:             return "month"
    return None


def _map_employment_type(et: Optional[str]) -> Optional[str]:
    if not et:
        return None
    s = et.strip().lower()
    return {
        "full-time": "FULLTIME",
        "fulltime":  "FULLTIME",
        "part-time": "PARTTIME",
        "parttime":  "PARTTIME",
        "contract":  "CONTRACTOR",
        "contractor":"CONTRACTOR",
        "internship":"INTERN",
        "intern":    "INTERN",
        # add "temporary":"TEMPORARY" if needed
    }.get(s)


def _build_query(query: str, location: Optional[str], remote: bool) -> str:
    q = (query or "").strip()
    loc = (location or "").strip().lower()
    # Keep location in the text (JSearch matches "role in City" style or simple "role City")
    if location and loc != "remote":
        q = f"{q} {location}".strip()
    if remote and "remote" not in q.lower():
        q = f"{q} remote".strip()
    return q or "software engineer"


def _mk_id(title: str, company: str, location: str, url: str) -> str:
    fp = f"{title}|{company}|{location}|{url}"
    return "jsearch-" + hashlib.sha1(fp.encode("utf-8")).hexdigest()[:16]


async def fetch_jsearch_jobs(
    *,
    client: httpx.AsyncClient,
    query: str,
    location: Optional[str],
    remote: bool,
    page: int,
    per_page: int,
    posted_within: Optional[str],
    employment_type: Optional[str],
) -> List[JobItem]:
    if not KEY:
        log.warning("JSearch: RAPIDAPI_KEY missing; returning []")
        return []

    q  = _build_query(query, location, remote)
    dp = _map_date_posted(posted_within)
    et = _map_employment_type(employment_type)

    # Decide how many JSearch pages to fetch this call:
    # - at least PRELOAD_PAGES
    # - enough to cover requested per_page
    # - capped by MAX_PAGES
    pages_needed_from_per_page = max(1, math.ceil(max(int(per_page or 20), 1) / max(PAGE_SIZE, 1)))
    pages_needed = max(PRELOAD_PAGES, pages_needed_from_per_page)
    pages_needed = max(1, min(pages_needed, MAX_PAGES))

    params = {
        "query": q,
        "page": str(max(int(page or 1), 1)),   # send as string
        "num_pages": str(pages_needed),        # 👈 preload multiple pages
    }
    if dp:
        params["date_posted"] = dp
    if et:
        params["employment_types"] = et
    if remote:
        params["remote_jobs_only"] = "true"

    headers = {
        "X-RapidAPI-Key": KEY,
        "X-RapidAPI-Host": HOST,
        "Accept": "application/json",
    }

    # Primary + alternate path (some proxies use /search vs /api/v1/search)
    primary_url = BASE_URL
    alt_url = f"https://{HOST}/api/v1/search" if PATH != "/api/v1/search" else f"https://{HOST}/search"
    urls_to_try = [primary_url] + ([alt_url] if alt_url != primary_url else [])

    backoff = 0.9
    data = None

    for url in urls_to_try:
        for attempt in range(RETRIES_PER_URL + 1):
            try:
                log.debug("JSearch GET %s params=%s", url, params)
                r = await client.get(url, params=params, headers=headers, timeout=TIMEOUT_SECS)

                if r.status_code in (429, 500, 502, 503, 504):
                    if attempt < RETRIES_PER_URL:
                        await asyncio.sleep(backoff * (2 ** attempt))
                        continue
                    log.warning("JSearch transient error after retries: %s %s", r.status_code, r.text[:400])
                    break

                if r.status_code == 404:
                    log.info("JSearch 404 on %s; trying alternate if available.", url)
                    break

                r.raise_for_status()
                data = r.json()
                break
            except Exception as e:
                log.warning("JSearch request error: %s", e)
                if attempt < RETRIES_PER_URL:
                    await asyncio.sleep(backoff * (2 ** attempt))
                    continue
        if data is not None:
            break

    if data is None:
        log.warning("JSearch failed across paths; returning [].")
        return []

    # results may be under data | results | jobs
    rows = []
    if isinstance(data, dict):
        rows = data.get("data") or data.get("results") or data.get("jobs") or []
    elif isinstance(data, list):
        rows = data
    if not isinstance(rows, list):
        rows = []

    out: List[JobItem] = []
    for it in rows:
        title   = (it.get("job_title") or it.get("title") or "").strip() or "Untitled"
        company = (it.get("employer_name") or it.get("company_name") or it.get("job_publisher") or "").strip()
        location_s = (
            ", ".join([x for x in [it.get("job_city"), it.get("job_state"), it.get("job_country")] if x])
            or it.get("location")
            or ("Remote" if it.get("job_is_remote") else "")
            or ""
        )
        desc   = it.get("job_description") or it.get("description") or ""
        url    = it.get("job_apply_link") or it.get("job_apply_url") or it.get("job_url") or ""
        posted = it.get("job_posted_at_datetime_utc") or it.get("job_posted_at") or it.get("posted_at") or ""
        emp    = it.get("job_employment_type") or (it.get("job_employment_types") or [None])[0] or ""

        # salary pretty text
        min_sal = it.get("job_min_salary")
        max_sal = it.get("job_max_salary")
        curr    = it.get("job_salary_currency")
        period  = it.get("job_salary_period")  # YEAR, HOUR, etc.
        salary_text = ""
        if min_sal or max_sal:
            def fmt(n):
                try:
                    return f"{int(float(n)):,}"
                except Exception:
                    return str(n)
            if min_sal and max_sal: salary_text = f"{fmt(min_sal)}–{fmt(max_sal)}"
            elif max_sal:           salary_text = fmt(max_sal)
            elif min_sal:           salary_text = fmt(min_sal)
            if salary_text:
                if curr:   salary_text = f"{salary_text} {curr}"
                if period: salary_text = f"{salary_text} / {period}"

        # Stable id (optional; harmless if your schema ignores it)
        job_id = it.get("job_id") or _mk_id(title, company, location_s, url)

        # IMPORTANT: keep publisher as the source so you see "Dice", "LinkedIn", etc.
        publisher = (it.get("job_publisher") or "").strip() or "RapidAPI:JSearch"

        out.append(JobItem(
            # If your JobItem schema includes id/remote, these will be used.
            # If not, Pydantic will ignore them silently.
            # id=job_id,
            title=title,
            company=company,
            location=location_s,
            description=desc,
            url=url,
            posted_at=posted,
            employment_type=str(emp) if emp else None,
            salary=salary_text or None,
            source=publisher,  # ← show Dice / LinkedIn / etc.
            # remote=bool(it.get("job_is_remote") or it.get("is_remote") or it.get("remote")),
        ))

    # Do NOT trim to per_page; return everything fetched (pages_needed * PAGE_SIZE).
    # Let the aggregator dedupe/sort/paginate.
    if PAGE_SIZE > 0:
        cap = min(len(out), pages_needed * PAGE_SIZE)
        return out[:cap]
    return out
