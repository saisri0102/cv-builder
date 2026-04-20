// src/api/client.js

// --------------------- Base URL resolution ---------------------
const viteBase =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL)) ||
  null;

const craBase =
  (typeof process !== "undefined" &&
    process.env &&
    (process.env.REACT_APP_API_BASE || process.env.REACT_APP_API_BASE_URL)) ||
  null;

const rawBase = viteBase || craBase || "http://127.0.0.1:8000"; // prefer 127.0.0.1 to dodge some CORS oddities

// Ensure exactly one /api/v1 at the end of BASE
function normalizeBase(u) {
  const trimmed = String(u).replace(/\/+$/, "");
  return trimmed.endsWith("/api/v1") ? trimmed : `${trimmed}/api/v1`;
}
export const BASE = normalizeBase(rawBase);

// Debug flag (Vite or CRA)
const DEBUG =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_DEBUG || import.meta.env.VITE_APP_DEBUG)) ||
  (typeof process !== "undefined" &&
    process.env &&
    (process.env.REACT_APP_DEBUG || process.env.DEBUG));

// --------------------- Token helpers ---------------------
const TOKEN_KEY_PRIMARY = "access_token";
const TOKEN_KEY_FALLBACK = "token";

/** Read token from localStorage (fallback sessionStorage). */
export function getToken() {
  try {
    const read = (k) =>
      (typeof localStorage !== "undefined" && localStorage.getItem(k)) ||
      (typeof sessionStorage !== "undefined" && sessionStorage.getItem(k)) ||
      null;

    // Prefer access_token, but support old "token" for compatibility
    return read(TOKEN_KEY_PRIMARY) || read(TOKEN_KEY_FALLBACK);
  } catch {
    return null;
  }
}

/** Persist token (call after /auth/login). */
export function setToken(token, { session = false } = {}) {
  try {
    if (!token) return clearToken();
    if (session && typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(TOKEN_KEY_PRIMARY, token);
    } else if (typeof localStorage !== "undefined") {
      localStorage.setItem(TOKEN_KEY_PRIMARY, token);
    }
    // Keep old key in sync for legacy callers
    if (typeof localStorage !== "undefined") localStorage.setItem(TOKEN_KEY_FALLBACK, token);
    if (session && typeof sessionStorage !== "undefined") sessionStorage.setItem(TOKEN_KEY_FALLBACK, token);
  } catch {}
}

/** Remove token (call on logout / 401). */
export function clearToken() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(TOKEN_KEY_PRIMARY);
      localStorage.removeItem(TOKEN_KEY_FALLBACK);
    }
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem(TOKEN_KEY_PRIMARY);
      sessionStorage.removeItem(TOKEN_KEY_FALLBACK);
    }
  } catch {}
}

// Back-compat alias some codebases expect:
export const setAuthToken = setToken;

// --------------------- Path normalization ---------------------
/**
 * Normalize caller paths so they can pass:
 *  - "resume-cover"
 *  - "/resume-cover"
 *  - "/api/v1/resume-cover"
 *  - or even a full URL (we'll strip origin)
 */
function normalizePath(path) {
  if (!path) return "";
  let p = String(path).trim();

  // If a full URL is passed, strip origin and keep only path/query/hash
  try {
    const u = new URL(p);
    p = u.pathname + u.search + u.hash;
  } catch {
    // not a full URL; ignore
  }

  // Ensure single leading slash
  if (!p.startsWith("/")) p = `/${p}`;

  // If caller accidentally included /api/v1, strip it (BASE already has it)
  p = p.replace(/^\/+api\/v1\/?/, "/");

  // Collapse duplicate slashes
  p = p.replace(/\/{2,}/g, "/");
  return p;
}

// --------------------- Core request ---------------------
/**
 * Core API request (no cookies). Adds Authorization if token provided.
 * @param {string} path - API path (e.g., "/resume-cover")
 * @param {("GET"|"POST"|"PUT"|"PATCH"|"DELETE")} method
 * @param {any} body - JS object to JSON.stringify (ignored for GET)
 * @param {object} options
 * @param {string|null} options.token - Bearer token (defaults to stored token)
 * @param {number} options.timeoutMs - request timeout in ms (default 20000)
 * @param {AbortSignal} options.signal - optional AbortSignal to cancel
 * @param {object} options.headers - extra headers to merge (e.g., { "X-Foo": "Bar" })
 * @param {boolean} options.noAuth - if true, do not attach Authorization header
 * @returns {Promise<any>}
 */
export async function apiRequest(
  path,
  method = "GET",
  body,
  { token = getToken(), timeoutMs = 20000, signal: externalSignal, headers: extraHeaders = {}, noAuth = false } = {}
) {
  const url = `${BASE}${normalizePath(path)}`;

  // Merge timeout AbortController with external signal (if any)
  const ctrl = new AbortController();
  const signals = [ctrl.signal, externalSignal].filter(Boolean);
  const signal =
    signals.length === 1
      ? signals[0]
      : new AbortControllerMulti(...signals).signal; // tiny helper below

  // Build headers
  const headers = { "Content-Type": "application/json", ...extraHeaders };
  if (!noAuth) {
    const authToken = token && String(token).trim();
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
  }

  // Prepare fetch options
  const fetchOpts = {
    method,
    headers,
    signal,
  };

  if (method !== "GET" && method !== "HEAD") {
    // Only attach a body for non-GET/HEAD
    fetchOpts.body = body !== undefined ? JSON.stringify(body) : undefined;
  }

  // Debug log (safe)
  if (DEBUG) {
    const dbgHeaders = { ...headers };
    if (dbgHeaders.Authorization) dbgHeaders.Authorization = "Bearer <redacted>";
    console.debug(`[api] ${method} ${url}`, { headers: dbgHeaders, body });
  }

  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, fetchOpts);

    // Read raw text first
    const ctype = res.headers.get("content-type") || "";
    const isJson = /\bapplication\/json\b/i.test(ctype);
    const txt = await res.text();
    const hasBody = txt && txt.length > 0;

    let data;
    try {
      data = isJson ? (hasBody ? JSON.parse(txt) : null) : (hasBody ? txt : null);
    } catch {
      data = hasBody ? txt : null; // non-JSON or malformed JSON
    }

    if (!res.ok) {
      const msg =
        (data &&
          (data.detail ||
            data.message ||
            data.error ||
            (Array.isArray(data.errors) ? data.errors.join("; ") : data.errors))) ||
        `Request failed (${res.status}${res.statusText ? " " + res.statusText : ""})`;

      // Auto-clear token on 401 so UI can redirect to /login
      if (res.status === 401) clearToken();

      const err = new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
      err.status = res.status;
      err.data = data;
      err.url = url;
      if (DEBUG) console.warn("[api] error", err);
      throw err;
    }

    if (DEBUG) console.debug("[api] success", data);
    return data;
  } catch (e) {
    if (e?.name === "AbortError") {
      const err = new Error(`Network timeout after ${timeoutMs}ms`);
      err.cause = e;
      err.url = url;
      if (DEBUG) console.warn("[api] timeout", err);
      throw err;
    }
    const err = new Error(e?.message || "Network Error");
    err.cause = e;
    err.url = url;
    if (DEBUG) console.warn("[api] network failure", err);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// --------------------- Tiny helper to combine AbortSignals ---------------------
class AbortControllerMulti {
  constructor(...signals) {
    this._ctrl = new AbortController();
    const onAbort = () => this._ctrl.abort();
    signals.forEach((s) => s && s.addEventListener && s.addEventListener("abort", onAbort, { once: true }));
  }
  get signal() {
    return this._ctrl.signal;
  }
}

// --------------------- Convenience helpers ---------------------
export const getJSON   = (path, opts) => apiRequest(path, "GET",    undefined, opts);
export const postJSON  = (path, body, opts) => apiRequest(path, "POST",  body, opts);
export const putJSON   = (path, body, opts) => apiRequest(path, "PUT",   body, opts);
export const patchJSON = (path, body, opts) => apiRequest(path, "PATCH", body, opts);
export const delJSON   = (path, body, opts) => apiRequest(path, "DELETE", body, opts);

// --------------------- Axios-like default export (compat) ---------------------
/**
 * Minimal axios-like wrapper so existing code can do:
 *   import api from "./client";
 *   api.post("/resume-cover", payload, { headers: {...}, token, noAuth })
 *
 * Notes:
 * - For GET: api.get(path, { headers, token, noAuth, timeoutMs })
 * - For POST/PUT/PATCH/DELETE: second arg is body; third is options
 */
const api = {
  get: (path, config = {}) => getJSON(path, config),
  delete: (path, config = {}) => delJSON(path, undefined, config),
  post: (path, data, config = {}) => postJSON(path, data, config),
  put: (path, data, config = {}) => putJSON(path, data, config),
  patch: (path, data, config = {}) => patchJSON(path, data, config),
};

export default api;

// (optional) handy export for debugging at runtime
export const __DEBUG = { BASE, normalizePath };       