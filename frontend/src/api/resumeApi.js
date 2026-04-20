// src/api/resumeApi.js
import { BASE, getToken, postJSON } from "./client";

/**
 * Generate resume/cover via /api/v1/resume-cover
 * @param {{command:string, doc_type?:"resume"|"cover"|"both"|"auto", jd_text?:string}} payload
 * @returns {Promise<{doc_type:string, resume?:string, cover_letter?:string, mode:"openai"|"local">>}
 */
export function generateResumeCover(payload) {
  return postJSON("/resume-cover", payload); // token auto-added by client.js
}

/**
 * Save resume (+ optional cover) via /api/v1/resume-cover/save
 * @param {{resume_title:string, resume_text:string, cover_title?:string|null, cover_text?:string|null, resume_source?:string, cover_source?:string}} payload
 * @returns {Promise<{ok:true, resume_id:number, cover_id:number|null}>}
 */
export function saveGenerated(payload) {
  return postJSON("/resume-cover/save", payload); // token auto-added by client.js
}

/* ------------------------------------------------------------------ */
/* Optional: resume parsing helpers (file/text).                       */
/* If your backend exposes these, keep them; otherwise you can remove. */
/* ------------------------------------------------------------------ */

/**
 * Parse resume from plain text (POST JSON).
 * Backend route suggestion (adjust to your actual route): /api/v1/parse/
 */
export async function parseResumeText(resumeText) {
  return postJSON("/parse", { resume: resumeText });
}

/**
 * Parse resume from file upload (multipart).
 * If you expose /api/v1/parse/ as multipart, use this.
 */
export async function parseResumeFile(file) {
  const form = new FormData();
  form.append("file", file);

  // Use fetch directly so we don't set Content-Type (browser will set correct boundary)
  const url = `${BASE}/parse`; // BASE already includes /api/v1
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: form,
  });

  const text = await res.text();
  const isJson = /\bapplication\/json\b/i.test(res.headers.get("content-type") || "");
  const data = isJson ? (text ? JSON.parse(text) : null) : text;

  if (!res.ok) {
    const msg =
      (data &&
        (data.detail ||
          data.message ||
          data.error ||
          (Array.isArray(data.errors) ? data.errors.join("; ") : data.errors))) ||
      `Parse file failed (${res.status})`;
    const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}
