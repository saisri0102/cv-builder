# backend/utils/users.py
from __future__ import annotations

import os
import inspect
from typing import Type, Optional, List, Any

from backend.database import SessionLocal
from backend import models
from backend.utils.passwords import hash_password, verify_password


# ============================================================
# Dynamic User model resolution (keeps your original approach)
# ============================================================

def _iter_model_classes(mod) -> List[Type]:
    """
    Return all SQLAlchemy declarative classes defined in a module.
    Detect classes that have a __table__ attribute (typical for SQLAlchemy ORM).
    """
    classes: List[Type] = []
    for name, obj in vars(mod).items():
        if inspect.isclass(obj) and getattr(obj, "__table__", None) is not None:
            classes.append(obj)
    return classes


def _looks_like_user_model(cls: Type) -> bool:
    """
    Heuristics: class has an 'email' column and a password hash column ('password_hash' or 'password').
    """
    has_email = hasattr(cls, "email")
    has_pwd_hash = hasattr(cls, "password_hash") or hasattr(cls, "password")
    return bool(has_email and has_pwd_hash)


def _resolve_user_model() -> Type[models.Base]:
    """
    Resolve the User model class.

    Priority:
      1) If env var USER_MODEL_NAME is set, use that (e.g., "User" or "Account").
      2) Otherwise, scan models.* classes and pick the first that "looks like" a user.
      3) Fallback to models.User if present.

    Raises:
      RuntimeError if no suitable user model can be found.
    """
    # 1) Explicit by env
    explicit_name = os.getenv("USER_MODEL_NAME")
    if explicit_name:
        if hasattr(models, explicit_name):
            cls = getattr(models, explicit_name)
            # Best-effort check
            if getattr(cls, "__table__", None) is not None:
                return cls
        raise RuntimeError(f"USER_MODEL_NAME={explicit_name} not found in backend.models")

    # 2) Heuristic scan
    for cls in _iter_model_classes(models):
        if _looks_like_user_model(cls):
            return cls

    # 3) Fallback to "User" by convention
    if hasattr(models, "User"):
        return getattr(models, "User")

    raise RuntimeError("Could not resolve a User model. Set USER_MODEL_NAME or define models.User")


# Cache the resolved model so we don’t re-scan every call
_USER_MODEL: Type[models.Base] = _resolve_user_model()


# ===========================
# Utility helpers (non-ORM)
# ===========================

def _norm_email(email: str) -> str:
    return email.strip().lower()


# ===========================
# CRUD-like helpers (ORM)
# ===========================

def get_user_by_email(email: str):
    """
    Return user by email or None.
    """
    db = SessionLocal()
    try:
        em = _norm_email(email)
        return db.query(_USER_MODEL).filter(_USER_MODEL.email == em).first()
    finally:
        db.close()


def get_user_by_id(user_id: Any):
    """
    Return user by id or None.
    """
    db = SessionLocal()
    try:
        return db.query(_USER_MODEL).get(user_id)  # SQLAlchemy <2.0 style; OK for typical setups
    finally:
        db.close()


def create_user(email: str, password: str, name: Optional[str] = None, **extra_fields):
    """
    Create a new user with a hashed password.

    Args:
      email: required
      password: plain text, will be hashed
      name: optional
      extra_fields: any additional model fields you support (e.g., role, is_active)

    Returns:
      The created user row (refreshed).

    Raises:
      ValueError if email already exists.
    """
    db = SessionLocal()
    try:
        em = _norm_email(email)
        existing = db.query(_USER_MODEL).filter(_USER_MODEL.email == em).first()
        if existing:
            raise ValueError("Email already registered")

        # Determine correct password field name
        pwd_field = "password_hash" if hasattr(_USER_MODEL, "password_hash") else "password"

        # Build kwargs
        kwargs = dict(email=em)
        if hasattr(_USER_MODEL, "name"):
            kwargs["name"] = name
        # Add extra fields if they exist on the model
        for k, v in (extra_fields or {}).items():
            if hasattr(_USER_MODEL, k):
                kwargs[k] = v

        # Instantiate and set password
        user = _USER_MODEL(**kwargs)
        setattr(user, pwd_field, hash_password(password))

        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


def verify_user_password(user: Any, plain: str) -> bool:
    """
    Verify a plain text password against the stored password hash on the user instance.
    Handles models that use either 'password_hash' or 'password'.
    """
    if hasattr(user, "password_hash"):
        hashed = user.password_hash
    elif hasattr(user, "password"):
        hashed = user.password
    else:
        raise AttributeError("User model has neither 'password_hash' nor 'password' field")
    return verify_password(plain, hashed)


def set_user_password(user_id: Any, new_password: str) -> bool:
    """
    Update a user's password by id. Returns True on success, False if user not found.

    Uses 'password_hash' if present, else falls back to 'password'.
    """
    db = SessionLocal()
    try:
        user = db.query(_USER_MODEL).get(user_id)
        if not user:
            return False

        pwd_field = "password_hash" if hasattr(user, "password_hash") else "password"
        setattr(user, pwd_field, hash_password(new_password))
        db.add(user)
        db.commit()
        return True
    finally:
        db.close()
