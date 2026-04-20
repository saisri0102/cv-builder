from typing import Optional, List, Literal
from pydantic import BaseModel, Field

# Normalized employment types your aggregator uses
EmploymentType = Literal["full-time", "part-time", "contract", "internship", "temporary", "other"]

class JobItem(BaseModel):
    id: Optional[str] = None                         # ← add stable id
    source: Optional[str] = None                     # "jsearch" | "linkedin" | "indeed" (lowercase)
    title: str
    company: Optional[str] = None
    location: Optional[str] = None
    remote: Optional[bool] = None                    # ← add remote flag
    description: Optional[str] = None
    url: Optional[str] = None
    posted_at: Optional[str] = None                  # raw timestamp/string from provider
    salary: Optional[str] = None                     # raw text ("$60k–$80k / YEAR")
    employment_type: Optional[str] = None            # raw or normalized; aggregator may overwrite

class JobSearchResponse(BaseModel):
    page: int = Field(..., ge=1)
    per_page: int = Field(..., ge=1, le=100)
    total: int = Field(..., ge=0)
    items: List[JobItem]

class JobFilters(BaseModel):
    q: Optional[str] = None
    location: Optional[str] = None
    remote: Optional[bool] = False

    # Server-side filters (normalized by aggregator)
    employment_type: Optional[EmploymentType] = None   # normalized values above
    min_salary: Optional[int] = None                   # numeric annual

    # Accept a wide range; providers & aggregator map internally
    posted_within: Optional[str] = None                # e.g. "1","3","7","30","24h","7d","30d","today","week","month","past-week","past-24-hours"

    # Exact match on lowercase provider name
    source: Optional[str] = None                       # "jsearch" | "linkedin" | "indeed"

    sort_by: Optional[Literal["relevance", "posted_at", "salary"]] = "posted_at"
    sort_order: Optional[Literal["asc", "desc"]] = "desc"
    page: int = Field(1, ge=1)
    per_page: int = Field(20, ge=1, le=100)

    # Pydantic v2 config (optional nicety)
    model_config = {
        "str_strip_whitespace": True,
        "extra": "ignore",
    }
