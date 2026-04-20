// src/pages/SignupPage.js
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { setAuthToken } from "../lib/api";

const SignupPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");

    const cleanEmail = (email || "").trim();
    if (!cleanEmail) return setError("Email is required");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirmPassword) return setError("Passwords do not match");

    setLoading(true);
    try {
      const { data } = await api.post("/api/v1/auth/signup", {
        email: cleanEmail,
        password,
      });

      const accessToken = data?.access_token || data?.token || "";
      const rawType = (data?.token_type || "Bearer").trim();
      const tokenType = rawType.toLowerCase() === "bearer" ? "Bearer" : rawType;

      if (accessToken) {
        setAuthToken(accessToken, tokenType);
      } else {
        const loginRes = await api.post("/api/v1/auth/login", { email: cleanEmail, password });
        const loginToken = loginRes?.data?.access_token || loginRes?.data?.token || "";
        const loginTypeRaw = (loginRes?.data?.token_type || "Bearer").trim();
        const loginType = loginTypeRaw.toLowerCase() === "bearer" ? "Bearer" : loginTypeRaw;
        if (!loginToken) throw new Error("Signup succeeded, but login/token retrieval failed.");
        setAuthToken(loginToken, loginType);
      }

      await api.get("/api/v1/auth/me");
      navigate("/dashboard");
    } catch (err) {
      const detail =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Signup failed. Please try again.";
      setError(String(detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <style>{`
        /* Hard reset so nothing adds side gaps */
        * { box-sizing: border-box; }
        html, body, #root {
          height: 100%;
          width: 100%;
          margin: 0;
          padding: 0;
        }
        body { overflow-x: hidden; }

        @keyframes gradientBG {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      <div style={styles.center}>
        <div style={styles.card} role="main" aria-label="Signup form">
          <h2 style={styles.title}>📝 Create your account</h2>

          {error && (
            <p role="alert" style={styles.error}>
              {error}
            </p>
          )}

          <form onSubmit={handleSignup} style={styles.form} noValidate>
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
              placeholder="Password (min 6 chars)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              aria-label="Password"
              autoComplete="new-password"
              style={styles.input}
              disabled={loading}
            />
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              aria-label="Confirm Password"
              autoComplete="new-password"
              style={styles.input}
              disabled={loading}
            />

            <button type="submit" style={styles.button} disabled={loading}>
              {loading ? "Creating..." : "Sign Up"}
            </button>

            <p style={{ fontSize: "0.9rem", marginTop: 12 }}>
              Already have an account? <Link to="/login">Sign in</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
};

const styles = {
  // Full-bleed, fixed to viewport so no left gap can appear
  page: {
    position: "fixed",   // ✅ pin to viewport
    inset: 0,            // ✅ top:0 right:0 bottom:0 left:0
    overflowX: "hidden",
    overflowY: "auto",
    background:
      "linear-gradient(-45deg, #f9fafb, #eff6ff, #dbeafe, #bfdbfe, #a5b4fc)",
    backgroundSize: "400% 400%",
    backgroundRepeat: "no-repeat",
    animation: "gradientBG 20s ease infinite",
    fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
  },

  // Separate centering layer (so page can stay fixed/bleeding)
  center: {
    minHeight: "100%",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },

  card: {
    backgroundColor: "#fff",
    padding: "40px",
    borderRadius: "12px",
    boxShadow: "0 4px 30px rgba(0,0,0,0.05)",
    width: "100%",
    maxWidth: "420px",
    textAlign: "center",
  },
  title: { marginBottom: "24px", color: "#1f3b4d" },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  input: {
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    fontSize: "1rem",
  },
  // Old solid navy button color
  button: {
    backgroundColor: "#1f3b4d",
    color: "#fff",
    padding: "12px",
    borderRadius: "8px",
    border: "none",
    fontSize: "1rem",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(31,59,77,0.25)",
  },
  error: {
    backgroundColor: "#ffe8e8",
    color: "#b00020",
    border: "1px solid #ffc6c6",
    borderRadius: "8px",
    padding: "10px 12px",
    marginBottom: "12px",
    textAlign: "left",
  },
};

export default SignupPage;
