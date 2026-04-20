# backend/routes/news.py
from fastapi import APIRouter, HTTPException, Query
import httpx, re
from urllib.parse import urlparse
from datetime import datetime
import email.utils as eut
import xml.etree.ElementTree as ET

router = APIRouter(prefix="/api/v1/news", tags=["news"])

FEEDS = [
    "https://techcrunch.com/tag/jobs/feed/",
    "https://www.bls.gov/feeds/news_release/empsit.rss",
    "https://www.cnbc.com/id/100003114/device/rss/rss.html",
    "https://www.shrm.org/rss/fol/Page%20with%20One%20Content%20Type%20RSS%20Feed.xml",
    "https://www.hiringlab.org/feed/",
]

DEFAULT_KEYWORDS = [
    "job","jobs","hiring","hire","recruit","recruiting","recruitment",
    "career","careers","employment","employer","workforce","talent",
    "opening","openings","vacancy","vacancies","staffing","headcount",
    "layoff","layoffs","firing","freeze","internship","intern","contract",
]

def _parse_date(s: str | None) -> float:
    if not s: return 0.0
    try: return eut.parsedate_to_datetime(s).timestamp()
    except Exception:
        try: return datetime.fromisoformat(s.replace("Z","+00:00")).timestamp()
        except Exception: return 0.0

def _hostname(url: str) -> str:
    try: return urlparse(url).hostname or ""
    except Exception: return ""

IMG_RE = re.compile(r'<img[^>]+src=["\']([^"\']+)["\']', re.I)

def extract_image(el: ET.Element) -> str:
    # media:content / media:thumbnail
    media_ns = "{http://search.yahoo.com/mrss/}"
    mc = el.find(f".//{media_ns}content")
    if mc is not None and mc.get("url"): return mc.get("url")
    mt = el.find(f".//{media_ns}thumbnail")
    if mt is not None and mt.get("url"): return mt.get("url")

    # enclosure type image/*
    enc = el.find(".//enclosure")
    if enc is not None and (enc.get("type","").startswith("image/")) and enc.get("url"):
        return enc.get("url")

    # first <img> in description/content:encoded
    desc = el.findtext("description") or ""
    m = IMG_RE.search(desc)
    if m: return m.group(1)

    content_ns = "{http://purl.org/rss/1.0/modules/content/}"
    encoded = el.findtext(f"{content_ns}encoded") or ""
    m2 = IMG_RE.search(encoded)
    if m2: return m2.group(1)

    return ""

def parse_feed(xml_text: str, feed_url: str):
    out = []
    root = ET.fromstring(xml_text)

    # RSS 2.0
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        pub = item.findtext("pubDate") or item.findtext("dc:date")
        desc = (item.findtext("description") or "").strip()
        out.append({
            "title": title or "(no title)",
            "url": link,
            "published": _parse_date(pub),
            "source": _hostname(feed_url),
            "summary": desc,
            "image": extract_image(item),
        })

    # Atom
    atom_ns = "{http://www.w3.org/2005/Atom}"
    for entry in root.findall(f".//{atom_ns}entry"):
        title = (entry.findtext(f"{atom_ns}title") or "").strip()
        link_el = entry.find(f"{atom_ns}link")
        link = (link_el.get("href") if link_el is not None else "") or ""
        pub = (entry.findtext(f"{atom_ns}updated") or entry.findtext(f"{atom_ns}published"))
        summary = (entry.findtext(f"{atom_ns}summary") or "").strip()

        # Atom enclosure image
        img = ""
        for le in entry.findall(f"{atom_ns}link"):
            if (le.get("rel") == "enclosure") and str(le.get("type","")).startswith("image/") and le.get("href"):
                img = le.get("href"); break

        out.append({
            "title": title or "(no title)",
            "url": link,
            "published": _parse_date(pub),
            "source": _hostname(feed_url),
            "summary": summary,
            "image": img,
        })

    return out

def build_pattern(keywords):  # same as before
    words = [re.escape(k.strip()) for k in keywords if k.strip()]
    return re.compile(r"\b(" + "|".join(words) + r")\b", re.I) if words else re.compile(r".", re.I)

@router.get("/jobs")
async def get_job_news(limit: int = 6, q: str | None = None, strict: bool = True):
    items = []
    timeout = httpx.Timeout(6.0, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout, headers={"User-Agent": "TalentHireAI/1.0"}) as client:
        for url in FEEDS:
            try:
                r = await client.get(url)
                r.raise_for_status()
                items.extend(parse_feed(r.text, url))
            except Exception:
                continue

    keywords = [p.strip() for p in q.split("|")] if q else DEFAULT_KEYWORDS
    pat = build_pattern(keywords)

    filtered = []
    for it in items:
        text = f"{it.get('title','')}\n{it.get('summary','')}"
        if strict:
            if pat.search(text): filtered.append(it)
        else:
            it["_score"] = 1 if pat.search(text) else 0
            filtered.append(it)

    if not filtered:
        raise HTTPException(status_code=502, detail="No job-related news available right now.")

    filtered.sort(key=lambda x: (x.get("_score", 1), x.get("published", 0)), reverse=True)

    seen, out = set(), []
    for it in filtered:
        key = (it.get("title"), it.get("url"))
        if key in seen or not it.get("url"): continue
        seen.add(key)
        out.append({
            "title": it.get("title"),
            "url": it.get("url"),
            "published": it.get("published", 0),
            "source": it.get("source"),
            "image": it.get("image") or "",   # <-- include image
        })
        if len(out) >= limit: break

    if not out:
        raise HTTPException(status_code=502, detail="No job-related news after filtering.")
    return {"items": out}
