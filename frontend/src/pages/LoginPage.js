// src/pages/LoginPage.js
import React, { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import api, { setAuthToken } from "../lib/api";
import { FaLinkedinIn } from "react-icons/fa";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  // Optional LinkedIn OAuth URL (only render button if provided)
  const LINKEDIN_AUTH_URL =
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_LINKEDIN_AUTH_URL) ||
    (typeof process !== "undefined" && process.env && process.env.REACT_APP_LINKEDIN_AUTH_URL) ||
    "";

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrMsg("");
    setLoading(true);
    try {
      const payload = { email: (email || "").trim(), password };
      const { data } = await api.post("/api/v1/auth/login", payload);

      const accessToken = data?.access_token || data?.token || "";
      const rawType = (data?.token_type || "Bearer").trim();
      const tokenType = rawType.toLowerCase() === "bearer" ? "Bearer" : rawType;

      if (!accessToken) throw new Error("No access token returned by server.");

      setAuthToken(accessToken, tokenType);

      // sanity check
      await api.get("/api/v1/auth/me");

      const from = (location.state && location.state.from) || "/dashboard";
      navigate(from, { replace: true });
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Login failed. Please check your email and password.";
      setErrMsg(String(detail));
    } finally {
      setLoading(false);
    }
  };

  const handleLinkedInLogin = () => {
    if (LINKEDIN_AUTH_URL) {
      window.location.href = LINKEDIN_AUTH_URL;
    } else {
      setErrMsg("LinkedIn login requires a backend OAuth URL (LINKEDIN_AUTH_URL).");
    }
  };

  return (
    <div style={styles.page}>
      {/* Animations + small utility styles */}
      <style>{`
        @keyframes bgMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @media (prefers-reduced-motion: reduce) {
          .no-motion { animation: none !important; }
        }
      `}</style>

      {/* Decorative gradient blur blobs */}
      <div style={styles.blobA} aria-hidden="true" className="no-motion" />
      <div style={styles.blobB} aria-hidden="true" className="no-motion" />

      <div style={styles.card} role="main" aria-label="Login form">
        <h2 style={styles.title}>🔐 Login to Smart Auto-Apply</h2>

        {errMsg ? (
          <div role="alert" aria-live="assertive" style={styles.errorBox}>
            {errMsg}
          </div>
        ) : null}

        <form onSubmit={handleLogin} style={styles.form} noValidate>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="Email"
            autoComplete="email"
            style={styles.input}
            disabled={loading}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-label="Password"
            autoComplete="current-password"
            style={styles.input}
            disabled={loading}
          />

          <div style={styles.forgotRow}>
            <Link to="/forgot-password" style={styles.forgotLink}>
              Forgot Password?
            </Link>
          </div>

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div style={styles.divider} aria-hidden="true">
          OR
        </div>

        {LINKEDIN_AUTH_URL ? (
          <div style={styles.oauthButtonsRow}>
            <button
              type="button"
              style={{ ...styles.oauthBtn, backgroundColor: "#0077b5", color: "#fff" }}
              onClick={handleLinkedInLogin}
              aria-label="Continue with LinkedIn"
              disabled={loading}
            >
              <FaLinkedinIn style={styles.icon} />
              Continue with LinkedIn
            </button>
          </div>
        ) : null}

        <p style={styles.signupLink}>
          Don’t have an account{" "}
          <Link to="/signup" onClick={(e) => e.stopPropagation()}>
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

const styles = {
  // 🔵 Gradient Wave background (Frost Glow)
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
    overflow: "hidden",
    background:
      "linear-gradient(-45deg, #f9fafb, #eff6ff, #dbeafe, #bfdbfe, #a5b4fc)",
    backgroundSize: "400% 400%",
    animation: "bgMove 18s ease infinite",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },

  blobA: {
    position: "absolute",
    width: 520,
    height: 520,
    top: -120,
    right: -140,
    borderRadius: "50%",
    filter: "blur(80px)",
    opacity: 0.35,
    background:
      "radial-gradient(circle at 30% 30%, rgba(168,85,247,0.9), rgba(14,165,233,0.5), transparent 60%)",
    pointerEvents: "none",
  },
  blobB: {
    position: "absolute",
    width: 520,
    height: 520,
    bottom: -140,
    left: -160,
    borderRadius: "50%",
    filter: "blur(90px)",
    opacity: 0.35,
    background:
      "radial-gradient(circle at 70% 70%, rgba(34,197,94,0.9), rgba(14,165,233,0.5), transparent 60%)",
    pointerEvents: "none",
  },

  card: {
    position: "relative",
    background: "rgba(255,255,255,0.85)",
    backdropFilter: "blur(10px)",
    WebkitBackdropFilter: "blur(10px)",
    padding: "40px",
    borderRadius: "16px",
    boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
    width: "100%",
    maxWidth: "420px",
    textAlign: "center",
    border: "1px solid rgba(255,255,255,0.6)",
  },
  title: { marginBottom: "24px", color: "#0f172a" },

  errorBox: {
    backgroundColor: "#ffe8e8",
    color: "#b00020",
    border: "1px solid #ffc6c6",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "16px",
    textAlign: "left",
    fontSize: "0.95rem",
  },

  form: { display: "flex", flexDirection: "column", gap: "16px" },

  input: {
    padding: "12px 14px",
    borderRadius: "10px",
    border: "1px solid rgba(2,6,23,0.1)",
    fontSize: "1rem",
    outline: "none",
    background: "rgba(255,255,255,0.9)",
    boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset",
  },

  // ✅ Solid navy login button (same as signup)
  button: {
    backgroundColor: "#1f3b4d",
    color: "#fff",
    padding: "12px 14px",
    borderRadius: "10px",
    border: "none",
    fontSize: "1rem",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(31,59,77,0.25)",
    transition: "background 0.2s ease, transform 0.08s ease",
  },

  forgotRow: { textAlign: "right", marginBottom: "8px" },
  forgotLink: { fontSize: "0.9rem", color: "#0ea5e9", textDecoration: "none", cursor: "pointer" },

  divider: {
    margin: "20px 0",
    fontWeight: "bold",
    color: "rgba(15,23,42,0.45)",
    letterSpacing: 1,
  },

  oauthButtonsRow: { display: "flex", flexDirection: "column", gap: "10px", marginBottom: "10px" },
  oauthBtn: {
    width: "100%",
    padding: "12px",
    borderRadius: "10px",
    border: "none",
    fontSize: "0.95rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    whiteSpace: "nowrap",
    boxShadow: "0 6px 18px rgba(0,119,181,0.35)",
  },
  icon: { fontSize: "1.2rem" },

  signupLink: { marginTop: "20px", fontSize: "0.9rem", color: "rgba(15,23,42,0.6)" },
};

export default LoginPage;
