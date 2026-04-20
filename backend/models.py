# backend/models.py
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, Index, Boolean
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func as sa_func

from sqlalchemy.ext.mutable import MutableList, MutableDict

# JSON type that works on Postgres (JSONB) and falls back elsewhere
try:
    # Preferred when running Postgres
    from sqlalchemy.dialects.postgresql import JSONB as JSONType
except Exception:  # dev fallback (e.g., SQLite)
    from sqlalchemy import JSON as JSONType  # type: ignore

from backend.database import Base


# =======================
# User model
# =======================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Keep DB-level uniqueness, plus a CI unique index (see __table_args__)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)

    created_at = Column(DateTime, nullable=False, server_default=sa_func.now())
    updated_at = Column(DateTime, nullable=False, server_default=sa_func.now(), onupdate=sa_func.now())

    # === Payments / subscription ===
    stripe_customer_id = Column(String, nullable=True)
    subscription_status = Column(String, default="free")                  # trialing | active | past_due | canceled | unpaid | free
    subscription_current_period_end = Column(DateTime, nullable=True)     # end-of-period timestamp
    plan_key = Column(String, default="free")                             # pro_month | pro_year | free

    # === Trial (day-based or credit-based) ===
    trial_used = Column(Boolean, default=False)                           # one-time trial toggle
    trial_started_at = Column(DateTime, nullable=True)
    trial_expires_at = Column(DateTime, nullable=True)
    trial_runs_left = Column(Integer, default=0)                          # for credit-based trials

    # Relationships
    resumes = relationship(
        "Resume",
        back_populates="owner",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    profile = relationship(
        "Profile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # Case-insensitive unique email (works natively on Postgres; acceptable on SQLite ≥ 3.9)
    __table_args__ = (
        Index("uq_users_email_lower", sa_func.lower(email), unique=True),
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email={self.email!r}>"


# =======================
# Feedback model
# =======================
class Feedback(Base):
    __tablename__ = "feedbacks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Changed from String(500) -> Text to avoid overflow on long questions
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    feedback = Column(Text, nullable=False)

    created_at = Column(DateTime, nullable=False, server_default=sa_func.now())
    updated_at = Column(DateTime, nullable=False, server_default=sa_func.now(), onupdate=sa_func.now())

    def __repr__(self) -> str:
        return f"<Feedback id={self.id}>"


# =======================
# Resume model
# =======================
class Resume(Base):
    __tablename__ = "resumes"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Ownership
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)

    title = Column(String(200), nullable=False, index=True)
    content = Column(Text, nullable=False)
    source = Column(String(50), nullable=True, index=True, default="enhanced")

    created_at = Column(DateTime, nullable=False, server_default=sa_func.now(), index=True)
    updated_at = Column(DateTime, nullable=False, server_default=sa_func.now(), onupdate=sa_func.now())

    # Relationship
    owner = relationship("User", back_populates="resumes", passive_deletes=True)

    # Composite indexes to speed common queries
    __table_args__ = (
        Index("ix_resumes_user_created", "user_id", "created_at"),
        Index("ix_resumes_user_updated", "user_id", "updated_at"),
    )

    def __repr__(self) -> str:
        return f"<Resume id={self.id} user_id={self.user_id} title={self.title!r}>"


# =======================
# Profile model
# =======================
class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)

    full_name = Column(String(255), nullable=False)
    email     = Column(String(255), nullable=False)
    phone     = Column(String(50), nullable=True)
    location  = Column(String(255), nullable=True)
    linkedin  = Column(String(255), nullable=True)
    github    = Column(String(255), nullable=True)
    portfolio = Column(String(255), nullable=True)
    summary   = Column(Text, nullable=True)

    # Arrays/objects
    skills         = Column(MutableList.as_mutable(JSONType), nullable=False, default=list)
    experience     = Column(MutableList.as_mutable(JSONType), nullable=False, default=list)
    projects       = Column(MutableList.as_mutable(JSONType), nullable=False, default=list)
    education      = Column(MutableList.as_mutable(JSONType), nullable=False, default=list)
    certifications = Column(MutableList.as_mutable(JSONType), nullable=False, default=list)

    # dict for extra fields
    extras         = Column(MutableDict.as_mutable(JSONType), nullable=True, default=dict)

    created_at = Column(DateTime, nullable=False, server_default=sa_func.now())
    updated_at = Column(DateTime, nullable=False, server_default=sa_func.now(), onupdate=sa_func.now())

    # Relationship
    user = relationship("User", back_populates="profile", passive_deletes=True)

    # Helpful indices for UI filters/search (optional)
    __table_args__ = (
        Index("ix_profiles_full_name", "full_name"),
        Index("ix_profiles_location", "location"),
    )

    def __repr__(self) -> str:
        return f"<Profile id={self.id} user_id={self.user_id} full_name={self.full_name!r}>"
   