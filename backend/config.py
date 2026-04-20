# backend/config.py
import os
from pathlib import Path
from dotenv import load_dotenv

# --- Load env from backend/.env OR .env (whichever exists) ---
# Works whether you run from repo root or backend/
root = Path(__file__).resolve().parents[1]          # project root
backend_env = root / "backend" / ".env"
root_env = root / ".env"
if backend_env.exists():
    load_dotenv(backend_env)
elif root_env.exists():
    load_dotenv(root_env)

# === 🔐 Secrets (keep strict if you want; comment out to relax in dev) ===
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise ValueError("Missing OPENAI_API_KEY in .env")

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("Missing SECRET_KEY in .env")

# === ⚙️ Model Configuration ===
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "gpt-4")
MAX_TOKENS = int(os.getenv("MAX_TOKENS", "2048"))

# === 🚀 Feature Toggles ===
FEATURE_RESUME_ENHANCEMENT = os.getenv("FEATURE_RESUME_ENHANCEMENT", "false").lower() == "true"
FEATURE_COMPANY_INSIGHTS   = os.getenv("FEATURE_COMPANY_INSIGHTS", "false").lower() == "true"

# === 🌐 External Service URLs ===
RESUME_API_URL = os.getenv("RESUME_API_URL", "https://api.defaultresume.ai/v1")

# === 🌍 App Configuration ===
APP_BASE_URL = os.getenv("APP_BASE_URL", "http://localhost:5173")

# === 🌍 CORS Settings ===
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173"
    ).split(",")
]

# === 🗄️ Database Configuration (robust) ===
def _resolve_sqlite_url(url: str) -> str:
    """Turn 'sqlite:///relative.db' into an absolute path under project root.
    Keep ':memory:' as-is. Ensure absolute paths use 4 slashes."""
    if not url.startswith("sqlite:"):
        return url
    # ':memory:' or driver params
    if ":memory:" in url:
        return url
    # Strip prefix and normalize path
    prefix = "sqlite:///"
    if url.startswith(prefix):
        path = url[len(prefix):]
        # Already absolute? (starts with /) -> ensure we return with four slashes
        if Path(path).is_absolute():
            return f"sqlite:////{Path(path).as_posix().lstrip('/')}"
        # Make absolute under project root
        abs_path = (root / path).resolve()
        return f"sqlite:////{abs_path.as_posix().lstrip('/')}"
    # Other sqlite forms -> return as-is
    return url

# Prefer env DATABASE_URL; if missing, persist to ./data/TalentHireAI.db
_env_db = os.getenv("DATABASE_URL")
if _env_db:
    DATABASE_URL = _resolve_sqlite_url(_env_db)
else:
    data_dir = (root / "data").resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    sqlite_path = (data_dir / "TalentHireAI.db").resolve()
    DATABASE_URL = f"sqlite:////{sqlite_path.as_posix().lstrip('/')}"

# Optional SQL echo for debugging (SQL_ECHO=true)
SQL_ECHO = os.getenv("SQL_ECHO", "false").lower() == "true"

# === 📧 SMTP Email Settings ===
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "TalentHireAI Support")
