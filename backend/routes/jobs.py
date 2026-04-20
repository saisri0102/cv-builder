# backend/routes/jobs.py
from fastapi import APIRouter, Query, HTTPException
from typing import Optional
import logging

from backend.schemas.jobs import JobSearchResponse  # ensures pydantic models exist
from backend.services.job_aggregator import aggregate_jobs  # matches your filename

log = logging.getLogger("routes.jobs")

# NOTE: Do NOT set a prefix here since main.py already includes this router with prefix="/api/v1"
router = APIRouter()


@router.get("/jobs/search", response_model=JobSearchResponse, tags=["Jobs"])
async def jobs_search(
    q: Optional[str] = Query(None, description="Keywords, e.g. 'software engineer'"),
    location: Optional[str] = Query(None, description="City/State/Country or empty"),
    remote: Optional[bool] = Query(False, description="If true, bias search toward remote"),
    employment_type: Optional[str] = Query(
        None,
        description="full-time | part-time | contract | internship | temporary | any",
    ),
    min_salary: Optional[int] = Query(
        None, ge=0, description="Minimum annual salary (number only)"
    ),
    posted_within: Optional[str] = Query(
        None,
        description="any | 1 | 7 | 30 (days). Aggregator normalizes to 24h/7d/30d.",
    ),
    source: Optional[str] = Query(
        None, description="Filter by source name exactly if present (e.g., 'LinkedIn')"
    ),
    sort_by: Optional[str] = Query(
        "posted_at", description="posted_at | salary | relevance"
    ),
    sort_order: Optional[str] = Query("desc", description="asc | desc"),
    page: int = Query(1, ge=1, description="1-based page index"),
    per_page: int = Query(10, ge=1, le=100, description="items per page (default 10)"),

):
    """
    Aggregated job search endpoint:
    - Calls enabled providers via the aggregator
    - Applies normalization, filters, sorting, and pagination
    - Returns a stable schema (JobSearchResponse)
    """
    try:
        items, total = await aggregate_jobs(
            query=q or "",
            location=location or "",
            remote=bool(remote),
            employment_type=employment_type,
            min_salary=min_salary,
            posted_within=posted_within,  # aggregator sanitizes 'any'/'1'/'7'/'30'
            source=source,
            sort_by=sort_by or "posted_at",
            sort_order=sort_order or "desc",
            page=page,
            per_page=per_page,
        )
        return JobSearchResponse(page=page, per_page=per_page, total=total, items=items)
    except Exception:
        # Print full traceback to the server logs for fast debugging
        log.exception("jobs_search failed")
        raise HTTPException(status_code=500, detail="Internal Server Error")
