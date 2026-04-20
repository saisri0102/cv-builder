# backend/schemas/jobs.py
from pydantic import BaseModel, HttpUrl
from typing import Optional

class JobItem(BaseModel):
    source: str
    title: str
    company: str
    location: str
    description: Optional[str] = None
    url: Optional[HttpUrl] = None
    posted_at: Optional[str] = None
    salary: Optional[str] = None
    employment_type: Optional[str] = None
