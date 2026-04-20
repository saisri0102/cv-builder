import React, { useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

// CRA env var
const API = process.env.REACT_APP_API_BASE_URL || "http://127.0.0.1:8000";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const tokenFromUrl = useMemo(() => params.get("token") || "", [params]);

  const [token, setToken] = useState(tokenFromUrl);
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState({ type: "", msg: "" });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus({ type: "loading", msg: "Updating password..." });

    try {
      const res = await fetch(`${API}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to reset password");

      setStatus({ type: "success", msg: data.message || "Password updated successfully." });
      setPassword("");
    } catch (err) {
      setStatus({ type: "error", msg: err.message || "Something went wrong" });
    }
  };

  return (
    <div style={container}>
      <h2>Reset Password</h2>
      <form onSubmit={handleSubmit} style={{ marginTop: 16 }}>
        <label htmlFor="token" style={label}>Token</label>
        <input
          id="token"
          type="text"
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste token here"
          style={input}
        />

        <label htmlFor="password" style={label}>New Password</label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="NewPass123!"
          style={input}
        />

        <button type="submit" disabled={status.type === "loading"} style={button}>
          {status.type === "loading" ? "Updating..." : "Reset Password"}
        </button>
      </form>

      {status.msg && (
        <div style={{ ...msg, color: status.type === "error" ? "#b00020" : "#0a6" }}>
          {status.msg}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Link to="/login">Back to login</Link>
      </div>
    </div>
  );
}

const container = { maxWidth: 460, margin: "60px auto", padding: 24 };
const label = { display: "block", marginBottom: 6, fontWeight: 600 };
const input = { width: "100%", padding: 10, marginBottom: 12, borderRadius: 6, border: "1px solid #ccc" };
const button = { padding: "10px 16px", borderRadius: 6, border: "none", background: "#1f3b4d", color: "#fff", cursor: "pointer" };
const msg = { marginTop: 12, fontWeight: 600 };
