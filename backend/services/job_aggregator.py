import os
import logging
import asyncio
import hashlib
from typing import List, Tuple, Optional

import httpx
from fastapi import HTTPException

from backend.schemas.jobs import JobItem
from backend.services.normalize import (
    norm_employment_type, parse_salary_max, parse_ts, within_days
)
from backend.services.providers.jsearch import fetch_jsearch_jobs
from backend.services.providers.linkedin import fetch_linkedin_jobs
from backend.services.providers.indeed import fetch_indeed_jobs

log = logging.getLogger("jobs.aggregator")

# --- NEW: page size control (defaults to 10) ---
PAGE_SIZE = int(os.getenv("JOBS_PAGE_SIZE", "10"))
FORCE_PAGE_SIZE = os.getenv("JOBS_FORCE_PAGE_SIZE", "true").strip().lower() == "true"  # force exactly PAGE_SIZE


def _enabled(env_name: str) -> bool:
    return os.getenv(env_name, "false").strip().lower() == "true"


def _fingerprint(job: JobItem) -> str:
    base = f"{(job.title or '').strip()}|{(job.company or '').strip()}|{(job.location or '').strip()}"
    return hashlib.sha1(base.encode("utf-8")).hexdigest()


async def aggregate_jobs(
    *,
    query: str,
    location: Optional[str] = None,
    remote: bool = False,
    employment_type: Optional[str] = None,
    min_salary: Optional[int] = None,
    posted_within: Optional[str] = None,
    source: Optional[str] = None,
    sort_by: str = "posted_at",
    sort_order: str = "desc",
    page: int = 1,
    per_page: int = 20,
) -> Tuple[List[JobItem], int]:
    """Aggregate jobs from multiple providers with safe filters & unified pagination."""

    # --- normalize paging to always give 10/page (unless you flip the env) ---
    page = max(1, int(page or 1))
    if FORCE_PAGE_SIZE:
        per_page = PAGE_SIZE
    else:
        per_page = min(100, max(1, int(per_page or PAGE_SIZE)))

    src_norm = (source or "").strip().lower() or None

    use_jsearch = _enabled("PROVIDER_JSEARCH_ENABLED")
    use_linkedin = _enabled("PROVIDER_LINKEDIN_ENABLED")
    use_indeed = _enabled("PROVIDER_INDEED_ENABLED")

    log.info(
        "AGG flags jsearch=%s linkedin=%s indeed=%s | q='%s' loc='%s' remote=%s posted_within=%s et=%s min_salary=%s source=%s page=%s per_page=%s",
        use_jsearch, use_linkedin, use_indeed, query, location, remote,
        posted_within, employment_type, min_salary, src_norm, page, per_page
    )

    if not (use_jsearch or use_linkedin or use_indeed):
        raise HTTPException(
            status_code=400,
            detail="No job providers enabled. Set PROVIDER_JSEARCH_ENABLED/PROVIDER_LINKEDIN_ENABLED/PROVIDER_INDEED_ENABLED=true in .env",
        )

    # Fetch a little more than per_page (we paginate after merge)
    # Keep at least 20 to ensure a cushion for filters/dedup
    per_provider = max(20, per_page)

    raw_results: List[JobItem] = []

    async with httpx.AsyncClient(timeout=30) as client:
        tasks = []

        if use_jsearch:
            tasks.append(fetch_jsearch_jobs(
                client=client,
                query=query,
                location=location,
                remote=remote,
                page=page,
                per_page=per_provider,
                posted_within=posted_within,
                employment_type=employment_type,
            ))

        if use_linkedin:
            tasks.append(fetch_linkedin_jobs(
                client=client,
                query=query,
                location=location,
                remote=remote,
                page=page,
                per_page=per_provider,
                posted_within=posted_within,
                employment_type=employment_type,
            ))

        if use_indeed:
            tasks.append(fetch_indeed_jobs(
                client=client,
                query=query,
                location=location or "",
                remote=remote,
                page=page,
                per_page=per_provider,
                posted_within=posted_within,
            ))

        results_list = await asyncio.gather(*tasks, return_exceptions=True)

    # Flatten, skipping provider exceptions
    for idx, items in enumerate(results_list):
        if isinstance(items, Exception):
            log.warning("Provider %d fetch failed: %s", idx, items)
            continue
        if items:
            log.info("AGG: provider %d returned %d items", idx, len(items))
            raw_results.extend(items)

    log.info("AGG: raw items from providers = %d", len(raw_results))
    for j in raw_results[:30]:
        log.debug("RAW JOB: title=%s | company=%s | loc=%s | posted=%s | et=%s | src=%s",
                  j.title, j.company, j.location, j.posted_at, j.employment_type, j.source)

    # --- de-duplicate (title+company+location)
    seen = set()
    deduped: List[JobItem] = []
    for j in raw_results:
        fp = _fingerprint(j)
        if fp in seen:
            continue
        seen.add(fp)
        deduped.append(j)

    # --- normalize + filters ---
    filtered: List[JobItem] = []
    for j in deduped:
        try:
            et_norm = norm_employment_type(j.employment_type)
            ts_ms = parse_ts(j.posted_at)
            sal_max = parse_salary_max(j.salary)

            # Remote filter (strict: only True passes when requested)
            if remote and not (getattr(j, "remote", None) is True):
                continue

            # Employment type filter
            if employment_type and et_norm and et_norm.lower() != employment_type.lower():
                continue

            # Salary filter
            if min_salary and sal_max is not None and sal_max < min_salary:
                continue

            # Posted-within filter
            if posted_within:
                val = str(posted_within).strip().lower()
                days_map = {
                    "1": 1, "24": 1, "24h": 1, "day": 1, "today": 1,
                    "3": 3, "3d": 3, "3days": 3,
                    "7": 7, "7d": 7, "week": 7, "past-week": 7,
                    "30": 30, "30d": 30, "month": 30, "past-month": 30,
                    "past-24-hours": 1,
                }
                days_limit = days_map.get(val)
                if days_limit and ts_ms is not None and not within_days(ts_ms, days_limit):
                    continue

            # Source filter (now strict: if filter is present, drop items with missing/other source)
            if src_norm and (j.source is None or (j.source or "").lower() != src_norm):
                continue

            j.employment_type = et_norm or j.employment_type
            filtered.append(j)
        except Exception as e:
            log.exception("Error processing job '%s': %s", getattr(j, "title", "?"), e)

    log.info("AGG: after filters total=%d (page=%d, per_page=%d)", len(filtered), page, per_page)

    # --- sort ---
    reverse = sort_order.lower() == "desc"
    if sort_by == "posted_at":
        filtered.sort(key=lambda x: (parse_ts(x.posted_at) or 0), reverse=reverse)
    elif sort_by == "salary":
        filtered.sort(key=lambda x: (parse_salary_max(x.salary) or 0), reverse=reverse)
    else:
        filtered.sort(key=lambda x: ((x.title or ""), (x.company or "")), reverse=reverse)

    # --- paginate (after merge) ---
    total = len(filtered)
    start = max(0, (page - 1) * per_page)
    end = start + per_page
    paginated = filtered[start:end]

    log.info("AGG: returning %d jobs (page=%d, per_page=%d, total=%d)", len(paginated), page, per_page, total)
    return paginated, total
