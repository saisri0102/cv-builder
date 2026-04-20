// src/lib/api.js
import axios from "axios";

const RAW_API =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_BASE_URL)) ||
  (typeof process !== "undefined" &&
    process.env &&
    (process.env.REACT_APP_API_BASE || process.env.REACT_APP_API_BASE_URL)) ||
  "http://127.0.0.1:8000";

export const API_BASE = String(RAW_API).replace(/\/+$/, "");

// ⬇️ raise default to 60s, allow env override
const RAW_TIMEOUT =
  (typeof import.meta !== "undefined" &&
    import.meta.env &&
    (import.meta.env.VITE_HTTP_TIMEOUT_MS || import.meta.env.VITE_AXIOS_TIMEOUT_MS)) ||
  (typeof process !== "undefined" &&
    process.env &&
    (process.env.REACT_APP_HTTP_TIMEOUT_MS || process.env.REACT_APP_AXIOS_TIMEOUT_MS)) ||
  "60000";

const DEFAULT_TIMEOUT = Number.parseInt(String(RAW_TIMEOUT), 10) || 60000;

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
  timeout: DEFAULT_TIMEOUT, // ⬅️ was 20000
  headers: { "Content-Type": "application/json" },
  maxContentLength: 25 * 1024 * 1024,
  maxBodyLength: 25 * 1024 * 1024,
});

function hasStorage() {
  try {
    if (typeof window === "undefined") return false;
    const k = "__tchk__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function getLS(key) {
  return hasStorage() ? window.localStorage.getItem(key) : null;
}
function setLS(key, val) {
  if (hasStorage()) window.localStorage.setItem(key, val);
}
function delLS(key) {
  if (hasStorage()) window.localStorage.removeItem(key);
}

/** Set/clear Authorization and persist for rehydration */
export function setAuthToken(token, tokenType = "Bearer") {
  const type = (tokenType || "Bearer").trim();
  const normalizedType = type.toLowerCase() === "bearer" ? "Bearer" : type;

  if (token) {
    api.defaults.headers.common.Authorization = `${normalizedType} ${token}`;
    setLS("token", token);
    setLS("access_token", token);
    setLS("token_type", normalizedType);
  } else {
    delete api.defaults.headers.common.Authorization;
    delLS("token");
    delLS("access_token");
    delLS("token_type");
  }
}

export function logout() {
  setAuthToken(null);
}

// Inject Authorization from localStorage on every request
api.interceptors.request.use((config) => {
  const t = getLS("token") || getLS("access_token");
  const type = getLS("token_type") || "Bearer";
  if (t && !config.headers?.Authorization) {
    config.headers = config.headers || {};
    const normalizedType = (type || "Bearer").toLowerCase() === "bearer" ? "Bearer" : type;
    config.headers.Authorization = `${normalizedType} ${t}`;
  }
  return config;
});

// Dev-only: log whether Authorization header is present
if (typeof import.meta !== "undefined" && import.meta?.env?.DEV) {
  api.interceptors.request.use((config) => {
    // eslint-disable-next-line no-console
    console.debug(
      "[API]",
      (config.method || "GET").toUpperCase(),
      config.url,
      "Auth:",
      config.headers?.Authorization ? "present" : "missing",
      `Timeout:${config.timeout ?? DEFAULT_TIMEOUT}ms`
    );
    return config;
  });
}

// Auto-clear auth on 401 (optional)
api.interceptors.response.use(
  (r) => r,
  (error) => {
    if (error?.response?.status === 401) {
      delLS("token");
      delLS("access_token");
      delLS("token_type");
      delete api.defaults.headers.common.Authorization;
    }
    return Promise.reject(error);
  }
);

export default api;
