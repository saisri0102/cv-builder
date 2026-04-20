// src/api/resumeStore.js
const API_BASE = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
const SAVE_URL = `${API_BASE}/api/v1/resume/save`;
const LIST_URL = `${API_BASE}/api/v1/resume/list`;

export async function saveResume({ title, content, source = "enhanced" }) {
  const res = await fetch(SAVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, source }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || "Failed to save resume");
  }
  return res.json();
}

export async function listResumes() {
  const res = await fetch(LIST_URL);
  if (!res.ok) throw new Error("Failed to list resumes");
  return res.json();
}
