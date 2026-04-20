# backend/schemas_profile.py
from typing import List, Optional, Any, Dict
from pydantic import BaseModel, EmailStr, Field

class ProfileBase(BaseModel):
    # --- Contact & Links ---
    full_name: str
    email: EmailStr
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    portfolio: Optional[str] = None

    # --- Summary ---
    summary: Optional[str] = None

    # --- Structured fields (arrays / objects) ---
    skills: List[str] = Field(default_factory=list)
    experience: List[Dict[str, Any]] = Field(default_factory=list)
    projects: List[Dict[str, Any]] = Field(default_factory=list)
    education: List[Dict[str, Any]] = Field(default_factory=list)
    certifications: List[Dict[str, Any]] = Field(default_factory=list)

    # --- Extras (free-form object) ---
    extras: Optional[Dict[str, Any]] = None

class ProfileCreate(ProfileBase):
    """Payload for create (same shape as base)."""
    pass

class ProfileUpdate(ProfileBase):
    """Payload for update (same shape as base)."""
    pass

class ProfileOut(ProfileBase):
    """Response sent back to the frontend."""
    id: int

    # Pydantic v1 uses orm_mode; v2 uses from_attributes.
    class Config:
        orm_mode = True
        from_attributes = True
