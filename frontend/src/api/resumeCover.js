// src/api/resume-cover.js
import api from "./client";

/** === Auth header helper (JWT in localStorage) ========================== */
function authHeaders() {
  const token = (localStorage.getItem("token") || "").trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function jsonHeaders(includeAuth = true) {
  return {
    "Content-Type": "application/json",
    ...(includeAuth ? authHeaders() : {}),
  };
}

/**
 * Generate resume/cover/both (PUBLIC, but attaches JWT if present so the
 * backend can optionally use your saved Profile).
 *
 * Expected backend schema:
 * {
 *   doc_type: "resume" | "cover" | "both" | "auto",   // required
 *   role_or_target: string,                            // required
 *   guidance?: string,
 *   company?: string,
 *   include_contact?: boolean,
 *
 *   // Optional extras your backend may support:
 *   include_profile?: boolean,        // default true here
 *   contact_overrides?: { ... }       // optional
 * }
 */
export async function generateResumeCover({
  doc_type = "resume",
  role_or_target,
  guidance = "",
  company = "",
  include_contact = true,
  include_profile = true,
  contact_overrides, // optional object
} = {}) {
  // --- Validate required/allowed fields on the client (nice UX) ---
  const allowedDocTypes = new Set(["resume", "cover", "both", "auto"]);
  if (!allowedDocTypes.has(String(doc_type))) {
    throw new Error(
      `Invalid doc_type "${doc_type}". Use "resume" | "cover" | "both" | "auto".`
    );
  }
  if (!role_or_target || !String(role_or_target).trim()) {
    throw new Error('Missing required "role_or_target".');
  }

  // --- Build exact payload keys expected by FastAPI (snake_case) ---
  const body = {
    doc_type,
    role_or_target,
    guidance,
    company,
    include_contact: Boolean(include_contact),
    include_profile: Boolean(include_profile),
  };

  if (contact_overrides && typeof contact_overrides === "object") {
    body.contact_overrides = contact_overrides;
  }

  const headers = jsonHeaders(true); // attach token if exists (profile-aware)
  const { data } = await api.post("/resume-cover", body, { headers });
  return data; // { doc_type, resume?, cover_letter?, ... }
}

/**
 * Save a single document (PROTECTED).
 * Only "resume" or "cover" are supported here.
 *
 * Returns: { ok, resume_id? } or { ok, cover_id? }
 */
export async function saveDoc({ doc_type, title, content }) {
  const headers = jsonHeaders(true);
  if (!headers.Authorization) {
    throw new Error("Missing auth token: please log in before saving.");
  }

  let body;
  if (doc_type === "cover") {
    body = {
      doc_type: "cover",
      cover_title: title,
      cover_text: content,
    };
  } else if (doc_type === "resume") {
    body = {
      doc_type: "resume",
      resume_title: title,
      resume_text: content,
    };
  } else {
    throw new Error(
      `saveDoc: unsupported doc_type "${doc_type}". Use "resume" or "cover".`
    );
  }

  const { data } = await api.post("/resume-cover/save", body, { headers });
  return data;
}

/**
 * Save BOTH documents in one call (PROTECTED).
 *
 * Returns: { ok, resume_id, cover_id }
 */
export async function saveBoth({
  resumeTitle,
  resumeText,
  coverTitle,
  coverText,
}) {
  const headers = jsonHeaders(true);
  if (!headers.Authorization) {
    throw new Error("Missing auth token: please log in before saving.");
  }

  const body = {
    doc_type: "both",
    resume_title: resumeTitle,
    resume_text: resumeText,
    cover_title: coverTitle,
    cover_text: coverText,
  };

  const { data } = await api.post("/resume-cover/save", body, { headers });
  return data;
}
