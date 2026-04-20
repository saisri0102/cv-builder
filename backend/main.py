# backend/main.py
import os
import logging
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.routing import APIRoute

# -----------------------------
# Load environment from backend/.env (robust)
# -----------------------------
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

ENV = os.getenv("ENV", "dev").lower()
AUTO_MIGRATE = os.getenv("AUTO_MIGRATE", "false").strip().lower() == "true"
USE_AUTH_MIDDLEWARE = os.getenv("USE_AUTH_MIDDLEWARE", "false").strip().lower() == "true"

# -----------
# Logging
# -----------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

# ----------------------------------------
# DB metadata (DEV ONLY: auto-create tables)
# ----------------------------------------
from backend.database import Base, engine  # noqa: E402
from backend import models  # noqa: F401,E402

if ENV == "dev" or AUTO_MIGRATE:
    Base.metadata.create_all(bind=engine)

# -----------
# Routers (module imports)
# -----------
from backend.routes import jobs  # noqa: E402
from backend.routes import auth as auth_routes  # JWT login/signup
from backend.routes.resume_cover import router as resume_cover_router  # noqa: E402
from backend.routes import (  # noqa: E402
    resume_routes,   # short prefix e.g., "/resume"
    generate,        # short prefix e.g., "/generate"
    enhance,         # short prefix e.g., "/enhance"
    compare,         # short prefix e.g., "/compare"
    feedback,        # short prefix e.g., "/feedback"
    auth_reset,      # short prefix e.g., "/auth" (reset/otp)
    parse,           # short prefix e.g., "/parse"
)
from backend.routes.profile import router as profile_router  # noqa: E402
from backend.routes.jobs_debug import router as jobs_debug_router  # noqa: E402
from backend.routes.news import router as news_router  # noqa: E402

# ⬇️ NEW (Stripe payments + app-level trial)
from backend.routes.payments import router as payments_router  # noqa: E402
from backend.routes.trial import router as trial_router        # noqa: E402

# -----------
# CORS
# -----------
DEFAULT_ORIGINS = [
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:4173", "http://127.0.0.1:4173",
    "http://localhost:3000", "http://127.0.0.1:3000",
    "http://localhost:3001", "http://127.0.0.1:3001",
]
try:
    from backend.config import ALLOWED_ORIGINS as _ALLOWED_ORIGINS  # noqa: E402
except Exception:
    _ALLOWED_ORIGINS = None

ALLOWED_ORIGINS = _ALLOWED_ORIGINS or DEFAULT_ORIGINS

app = FastAPI(
    title="TalentHireAI API",
    version="1.0.0",
    description="AI-powered resume comparison, enhancement, and interview assistant",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Type", "Authorization"],
    max_age=600,
)

# ------------------------------------------------
# JWT Auth middleware (toggleable for debugging)
# ------------------------------------------------
if USE_AUTH_MIDDLEWARE:
    try:
        from backend.middleware.auth_middleware import AuthMiddleware
        app.add_middleware(
            AuthMiddleware,
            excluded_paths={
                "/", "/health",
                "/openapi.json", "/docs", "/redoc", "/favicon.ico",

                # Public JWT endpoints
                "/api/v1/auth/login",
                "/api/v1/auth/signup",
                "/api/v1/auth/refresh",

                # Public reset/OTP endpoints (match auth_reset.py)
                "/api/v1/auth/forgot-otp",
                "/api/v1/auth/verify-otp",
                "/api/v1/auth/reset-with-otp",

                # Public generators / news
                "/api/v1/resume-cover",
                "/api/v1/news/jobs",

                # ✅ Allow Stripe to post webhooks without JWT
                "/api/v1/pay/webhook",
            },
        )
        logging.info("AuthMiddleware mounted (USE_AUTH_MIDDLEWARE=true)")
    except Exception as e:
        logging.warning("AuthMiddleware not mounted: %s", e)
else:
    logging.info("AuthMiddleware disabled (USE_AUTH_MIDDLEWARE=false)")

# ------------------------------------------------
# OPTIONAL: log auth header presence
# ------------------------------------------------
@app.middleware("http")
async def log_auth_header(request: Request, call_next):
    auth_present = bool(request.headers.get("authorization"))
    logging.info("REQ %s %s  Auth? %s", request.method, request.url.path, auth_present)
    response = await call_next(request)
    return response

# ------------------------------------------------
# Mount routers (avoid double /api/v1 prefixes)
# ------------------------------------------------
app.include_router(resume_routes.router, prefix="/api/v1")
app.include_router(generate.router,      prefix="/api/v1")
app.include_router(enhance.router,       prefix="/api/v1")
app.include_router(compare.router,       prefix="/api/v1")
app.include_router(feedback.router,      prefix="/api/v1")
app.include_router(parse.router,         prefix="/api/v1")

# Auth (JWT + reset/otp)
app.include_router(auth_reset.router,    prefix="/api/v1/auth", tags=["Auth (Reset)"])
app.include_router(auth_routes.router,   prefix="/api/v1",      tags=["Auth (JWT)"])

# Resume/Cover generator — "/resume-cover" (PUBLIC) and "/resume-cover/save" (PROTECTED)
app.include_router(resume_cover_router,  prefix="/api/v1")

# Jobs + profile + debug
app.include_router(jobs.router,          prefix="/api/v1")
app.include_router(profile_router,       prefix="/api/v1")
# (Optional) enable if you use the debug router:
# app.include_router(jobs_debug_router,    prefix="/api/v1")

# News (RSS aggregator)
app.include_router(news_router)

# NEW: Payments + Trial (each file has its own /api/v1/* prefix)
app.include_router(payments_router)      # /api/v1/pay/*
app.include_router(trial_router)         # /api/v1/trial/*

# -----------
# Health & root
# -----------
@app.get("/health")
def health():
    return {"status": "ok", "env": ENV}

@app.get("/")
def root():
    return {"name": "TalentHireAI API", "version": "1.0.0"}

# -----------
# Debug prints on startup
# -----------
print("ENV =", ENV)
print("AUTO_MIGRATE =", AUTO_MIGRATE)
print("ALLOWED_ORIGINS =", ALLOWED_ORIGINS)
print("RAPIDAPI_KEY present?", bool(os.getenv("RAPIDAPI_KEY")))
print("JSEARCH host/path =", os.getenv("JSEARCH_RAPIDAPI_HOST"), os.getenv("JSEARCH_RAPIDAPI_PATH"))
print(
    "Stripe keys present?",
    bool(os.getenv("STRIPE_SECRET_KEY")),
    bool(os.getenv("STRIPE_PRICE_PRO_MONTH")),
    bool(os.getenv("STRIPE_PRICE_PRO_YEAR")),
    bool(os.getenv("STRIPE_WEBHOOK_SECRET")),
)

@app.on_event("startup")
async def list_routes():
    print("\n=== ROUTES ===")
    for r in app.routes:
        if isinstance(r, APIRoute):
            methods = ",".join(sorted(r.methods))
            mod = getattr(r.endpoint, "__module__", "?")
            fn  = getattr(r.endpoint, "__name__", "?")
            print(f"{methods:10s} {r.path:35s}  ->  {mod}.{fn}")
    print("==============\n")
     