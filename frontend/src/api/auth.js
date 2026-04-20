// src/api/auth.js
import { postJSON } from "./client";
import { setToken, clearToken, getToken } from "./client";

/**
 * Log in and persist the JWT so future requests auto-attach the header.
 * @returns {Promise<{access_token:string, token_type:string}>}
 */
export async function login(email, password) {
  const data = await postJSON("/auth/login", { email, password });
  if (data?.access_token) setToken(data.access_token);  // stores in localStorage
  return data;
}

/** Remove the stored token (use on logout or 401). */
export function logout() {
  clearToken();
}

/** Convenience: check if we have a token. */
export function isAuthenticated() {
  return !!getToken();
}