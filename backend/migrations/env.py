# backend/migrations/env.py
from __future__ import annotations

import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

# -------------------------------------------------------------------
# Make the project root importable so "import backend.XXX" works
# when running Alembic from the repository root.
# This file lives at backend/migrations/env.py, so go up two levels.
# -------------------------------------------------------------------
CURRENT_DIR = os.path.dirname(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)

# (Optional) load backend/.env so you can keep secrets out of alembic.ini
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join("backend", ".env"))
except Exception:
    pass

# -------------------------------------------------------------------
# Import the SAME Base your models subclass
# -------------------------------------------------------------------
from backend.database import Base  # Base is defined in backend/database.py

# IMPORTANT: Import models so tables register on Base.metadata
# (Side-effect import — do not remove)
import backend.models  # noqa: F401

# Alembic Config object, provides access to values in alembic.ini
config = context.config

# Prefer env vars; fall back to alembic.ini if set there
env_url = (
    os.getenv("ALEMBIC_DATABASE_URL")
    or os.getenv("DATABASE_URL")
    or os.getenv("DATABASE_URL_SYNC")
    or config.get_main_option("sqlalchemy.url")
)
if not env_url:
    raise RuntimeError(
        "No database URL found. Set ALEMBIC_DATABASE_URL or DATABASE_URL (or put sqlalchemy.url in alembic.ini)."
    )
config.set_main_option("sqlalchemy.url", env_url)

# Logging configuration
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata for ‘--autogenerate’
target_metadata = Base.metadata

# Optional: custom version table/schema via env
VERSION_TABLE = os.getenv("ALEMBIC_VERSION_TABLE", "alembic_version")
VERSION_TABLE_SCHEMA = os.getenv("ALEMBIC_VERSION_SCHEMA")  # e.g. "public"

# Enable batch mode automatically for SQLite (schema changes)
is_sqlite = env_url.startswith("sqlite")

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no DB connection)."""
    context.configure(
        url=env_url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        compare_server_default=True,
        version_table=VERSION_TABLE,
        version_table_schema=VERSION_TABLE_SCHEMA,
        render_as_batch=is_sqlite,  # helpful for SQLite ddl changes
        # include_schemas=True,  # enable if you manage multiple schemas
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (with DB connection)."""
    section = config.get_section(config.config_ini_section) or {}
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
            version_table=VERSION_TABLE,
            version_table_schema=VERSION_TABLE_SCHEMA,
            render_as_batch=is_sqlite,  # helpful for SQLite ddl changes
            # include_schemas=True,  # enable if you manage multiple schemas
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
