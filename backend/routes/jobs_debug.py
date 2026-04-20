# backend/routes/jobs_debug.py
import os
from fastapi import APIRouter, HTTPException
import httpx

router = APIRouter(prefix="/api/v1/_debug", tags=["Debug"])

HOST = os.getenv("JSEARCH_RAPIDAPI_HOST", "jsearch.p.rapidapi.com")
PATH = os.getenv("JSEARCH_RAPIDAPI_PATH", "/search")
KEY  = os.getenv("RAPIDAPI_KEY", "")

def _mask(k: str) -> str:
    if not k:
        return ""
    if len(k) <= 8:
        return "*" * len(k)
    return k[:4] + "*" * (len(k) - 8) + k[-4:]

@router.get("/key-status")
async def key_status(q: str = "software engineer", location: str = "", remote: bool = False):
    """
    Quick probe to verify RapidAPI key/host/path work.
    Returns provider HTTP status and a short body preview.
    """
    if not KEY:
        raise HTTPException(500, "RAPIDAPI_KEY is not set in environment")

    # Build a broad query
    query = q
    if remote and "remote" not in query.lower():
        query = f"{query} remote"
    if location:
        query = f"{query} {location}".strip()

    url = f"https://{HOST}{PATH}"
    params = {"query": query, "page": "1", "num_pages": "1"}
    headers = {"x-rapidapi-key": KEY, "x-rapidapi-host": HOST}

    async with httpx.AsyncClient(timeout=25) as client:
        r = await client.get(url, params=params, headers=headers)

    return {
        "rapidapi_key_present": True,
        "rapidapi_key_masked": _mask(KEY),
        "host": HOST,
        "path": PATH,
        "request_url": url,
        "params": params,
        "status_code": r.status_code,
        "ok": 200 <= r.status_code < 300,
        "hint": ("OK" if 200 <= r.status_code < 300 else "Check key/host/quota"),
        "body_preview": r.text[:600],
    }

@router.get("/echo-flags")
async def echo_flags():
    """ See which providers are enabled in this running process. """
    return {
        "PROVIDER_JSEARCH_ENABLED": os.getenv("PROVIDER_JSEARCH_ENABLED"),
        "PROVIDER_LINKEDIN_ENABLED": os.getenv("PROVIDER_LINKEDIN_ENABLED"),
        "PROVIDER_INDEED_ENABLED": os.getenv("PROVIDER_INDEED_ENABLED"),
        "RAPIDAPI_KEY_present": bool(os.getenv("RAPIDAPI_KEY")),
        "JSEARCH_RAPIDAPI_HOST": os.getenv("JSEARCH_RAPIDAPI_HOST"),
        "JSEARCH_RAPIDAPI_PATH": os.getenv("JSEARCH_RAPIDAPI_PATH"),
    }
