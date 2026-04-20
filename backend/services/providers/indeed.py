# backend/services/providers/indeed.py
import os, httpx, logging, hashlib, asyncio
from typing import List, Optional
from backend.schemas.jobs import JobItem

log = logging.getLogger("jobs.providers.indeed")

HOST = os.getenv("INDEED_RAPIDAPI_HOST", "indeed12.p.rapidapi.com")
PATH = os.getenv("INDEED_RAPIDAPI_PATH", "/jobs/search")
if not PATH.startswith("/"):
    PATH = "/" + PATH
BASE_URL = f"https://{HOST}"

def _map_posted_within(v: Optional[str]) -> Optional[str]:
    if not v: return None
    s = str(v).strip().lower()
    if s in {"today","1","24","24h","day"}: return "1"
    if s in {"3","3d","3days"}:             return "3"
    if s in {"7","week","7d"}:              return "7"
    if s in {"30","month","30d"}:           return "30"
    return None

def _mk_id(title: str, company: str, location: str, url: str) -> str:
    base = f"{title}|{company}|{location}|{url}"
    return "indeed-" + hashlib.sha1(base.encode("utf-8")).hexdigest()[:16]

def _bool_remote_from_row(row: dict) -> Optional[bool]:
    text = " ".join([
        str(row.get("location") or ""),
        str(row.get("title") or ""),
        str(row.get("workplaceType") or ""),
        str(row.get("employmentType") or ""),
        str(row.get("description") or row.get("snippet") or ""),
    ]).lower()
    if any(w in text for w in ["remote", "work from home", "wfh", "hybrid"]):
        return True
    if any(w in text for w in ["on-site", "on site", "onsite"]):
        return False
    return None

async def _get_with_retry(client, url, headers, params, tries=3):
    for i in range(tries):
        r = await client.get(url, headers=headers, params=params, timeout=30)
        if r.status_code != 429:
            return r
        await asyncio.sleep(0.5 * (i + 1))
    return r

async def fetch_indeed_jobs(
    client: httpx.AsyncClient,
    *,
    query: str,
    location: Optional[str],
    remote: Optional[bool],
    page: int,
    per_page: int,
    posted_within: Optional[str] = None,
) -> List[JobItem]:
    RAPIDAPI_KEY = os.getenv("RAPIDAPI_KEY", "")
    if not RAPIDAPI_KEY:
        log.warning("No RAPIDAPI_KEY for Indeed")
        return []
    if not HOST:
        log.warning("INDEED_RAPIDAPI_HOST is empty; skipping Indeed provider")
        return []

    q = (query or "").strip() or "software engineer"
    if remote and "remote" not in q.lower():
        q += " remote"

    params = {
        "query": q,
        "q": q,  # alias used by some proxies
        "location": location or "",
        "page": str(max(1, int(page or 1))),
        "offset": str(max(0, (int(page or 1)-1) * max(10, int(per_page or 10)))),
    }

    df = _map_posted_within(posted_within)
    if df:
        params["fromage"] = df

    headers = {
        "X-RapidAPI-Key": RAPIDAPI_KEY,
        "X-RapidAPI-Host": HOST,
    }

    url = BASE_URL + PATH
    try:
        r = await _get_with_retry(client, url, headers, params)
        r.raise_for_status()
    except httpx.HTTPStatusError as e:
        body = ""
        try:
            body = e.response.text[:400]
        except Exception:
            pass
        if getattr(e.response, "status_code", 0) in (401, 403) and "not subscribed" in (body or "").lower():
            log.error("Indeed: not subscribed to %s. Subscribe to this exact RapidAPI API/host.", HOST)
        else:
            log.error("Indeed %s -> HTTP %s: %s", url, getattr(e.response, "status_code", "?"), body)
        return []
    except Exception as e:
        log.exception("Indeed request failed: %s", e)
        return []

    try:
        data = r.json()
    except Exception:
        log.error("Indeed returned non-JSON")
        return []

    results = (
        (isinstance(data, dict) and (data.get("results") or data.get("data"))) or
        (data if isinstance(data, list) else [])
    )
    if not isinstance(results, list):
        log.info("Indeed: unexpected payload shape; zero items")
        return []

    items: List[JobItem] = []
    for row in results:
        title = str(row.get("jobtitle") or row.get("title") or "").strip()
        company = str(row.get("company") or row.get("company_name") or "").strip()
        loc = str(row.get("formattedLocation") or row.get("location") or "").strip()
        url_ = str(row.get("url") or row.get("job_url") or row.get("jobUrl") or "").strip()
        desc = row.get("snippet") or row.get("description")
        posted = row.get("date") or row.get("postedAt") or row.get("created_at") or row.get("listed_at")
        salary = row.get("salary") or row.get("salaryText") or row.get("compensation")

        native_id = row.get("jobkey") or row.get("id") or row.get("job_id")
        jid = str(native_id) if native_id else _mk_id(title, company, loc, url_)

        remote_flag = _bool_remote_from_row(row)
        if remote is True and remote_flag is False:
            continue

        items.append(JobItem(
            id=jid,
            source="indeed",
            title=title,
            company=company,
            location=loc,
            description=desc,
            url=url_,
            posted_at=str(posted or ""),
            salary=str(salary) if salary is not None else None,
            remote=remote_flag,
        ))

    log.info("Indeed returned %d items (pre-trim)", len(items))
    return items[: max(1, int(per_page or 10))]
