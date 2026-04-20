# backend/scripts/import_resumes_jsonl_to_db.py
import os, json
from datetime import datetime
from sqlalchemy.orm import Session
from backend.database import SessionLocal
from backend.models import Resume

JSONL_PATH = os.environ.get("RESUME_JSONL", "data/resumes.jsonl")

def parse_iso(ts: str):
    try:
        # accepts "2024-01-01T12:34:56Z" or "2024-01-01T12:34:56"
        return datetime.fromisoformat(ts.replace("Z", ""))
    except Exception:
        return datetime.utcnow()

def run():
    if not os.path.exists(JSONL_PATH):
        print(f"No file found at {JSONL_PATH}. Nothing to import.")
        return

    db: Session = SessionLocal()
    added = 0
    with open(JSONL_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except Exception:
                continue

            title   = obj.get("title") or "Untitled"
            content = obj.get("content") or ""
            source  = obj.get("source") or "other"
            created = parse_iso(obj.get("created_at") or "")

            r = Resume(
                title=title,
                content=content,
                source=source,
                created_at=created,
                updated_at=created,
            )
            db.add(r)
            added += 1

    db.commit()
    db.close()
    print(f"✅ Imported {added} resumes into Postgres from {JSONL_PATH}.")

if __name__ == "__main__":
    run()
