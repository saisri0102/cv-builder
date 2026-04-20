// src/api/feedback.js
import axios from "axios";

/** Resolve base URL for both Vite and CRA, and append /api/v1 */
const RAW =
  (typeof import.meta !== "undefined" && import.meta.env &&
    (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) ||
  (typeof process !== "undefined" && process.env &&
    (process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_BASE)) ||
  "http://127.0.0.1:8000";

const API_BASE = String(RAW).replace(/\/+$/, "") + "/api/v1";

/** Axios instance */
const API = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
  timeout: 30000,
});

/** Optional: attach JWT if you use auth elsewhere */
API.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("access_token") ||
    sessionStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/* ------------------ CRUD endpoints (your existing routes) ------------------ */
// Create new feedback (manual)
export async function createFeedback(payload) {
  const { data } = await API.post("/feedback/", payload);
  return data; // { message, id }
}

export async function getAllFeedback() {
  const { data } = await API.get("/feedback/");
  return data; // Feedback[]
}

export async function getFeedbackById(id) {
  const { data } = await API.get(`/feedback/${id}`);
  return data; // Feedback row
}

export async function updateFeedback(id, payload) {
  const { data } = await API.put(`/feedback/${id}`, payload);
  return data; // { message, updated_data }
}

export async function deleteFeedback(id) {
  const { data } = await API.delete(`/feedback/${id}`);
  return data; // { message }
}

/* ------------------ AI coaching endpoint (new) ------------------ */
// Score an interview answer and (optionally) save it server-side
export async function scoreInterviewAnswer({
  question,
  answer,
  style = "STAR",
  role,
  resume_text,
  jd_text,
  save = true,
}) {
  const { data } = await API.post("/feedback/interview-answer", {
    question,
    answer,
    style,
    role,
    resume_text,
    jd_text,
    save,
  });
  // { score, strengths[], improvements[], improved_answer, saved_id? }
  return data;
}

/* ------------------ (Optional) export the axios instance ------------------ */
export { API as feedbackClient };
