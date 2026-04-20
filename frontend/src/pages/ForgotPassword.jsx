// src/pages/ForgotPassword.jsx
import React, { useEffect, useRef, useState } from "react";
import { apiRequest } from "../api/client"; // ← cleaned import
import { useNavigate } from "react-router-dom";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1=email, 2=code, 3=new password
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  // OTP state
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const inputsRef = useRef([]);
  const codeValue = code.join("");

  // Resend cooldown (seconds)
  const RESEND_SECS = 60;
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const id = setInterval(() => setCooldown((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  // Clear OTP when returning to step 1
  useEffect(() => {
    if (step === 1) setCode(["", "", "", "", "", ""]);
  }, [step]);

  // Passwords
  const [pwd, setPwd] = useState({ a: "", b: "" });
  const [showPw, setShowPw] = useState(false);

  const clearAlerts = () => {
    setError("");
    setOkMsg("");
  };

  const handleSendCode = async (e) => {
    e.preventDefault();
    clearAlerts();
    if (!email || !email.includes("@")) return setError("Please enter a valid email address.");
    setLoading(true);
    try {
      await apiRequest("/auth/forgot-otp", "POST", { email }, { noAuth: true });
      setOkMsg("If this email exists, we’ve sent a 6-digit code.");
      setStep(2);
      setCooldown(RESEND_SECS);
      setTimeout(() => inputsRef.current?.[0]?.focus(), 80);
    } catch (err) {
      setError(err.message || "Failed to send code.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    clearAlerts();
    if (codeValue.length !== 6) return setError("Enter the 6-digit code.");
    setLoading(true);
    try {
      await apiRequest("/auth/verify-otp", "POST", { email, code: codeValue }, { noAuth: true });
      setOkMsg("Code verified. Please set a new password.");
      setStep(3);
    } catch (err) {
      setError(err.message || "Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    clearAlerts();
    if (pwd.a.length < 8) return setError("Password must be at least 8 characters.");
    if (pwd.a !== pwd.b) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await apiRequest(
        "/auth/reset-with-otp",
        "POST",
        { email, code: codeValue, newPassword: pwd.a },
        { noAuth: true }
      );
      setOkMsg("Password updated. You can now sign in.");
      setTimeout(() => navigate("/login"), 800);
    } catch (err) {
      setError(err.message || "Could not reset password.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    clearAlerts();
    if (cooldown > 0) return;
    if (!email) return setError("Missing email. Go back and enter your email.");
    setLoading(true);
    try {
      await apiRequest("/auth/forgot-otp", "POST", { email }, { noAuth: true });
      setOkMsg("We’ve sent a new 6-digit code.");
      setCooldown(RESEND_SECS);
    } catch (err) {
      setError(err.message || "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  };

  // OTP input helpers
  const onChangeDigit = (i, v) => {
    const only = v.replace(/\D/g, "");
    if (!/^\d?$/.test(only)) return;
    const next = [...code];
    next[i] = only;
    setCode(next);
    if (only && i < 5) inputsRef.current[i + 1]?.focus();
  };
  const onKeyDownDigit = (i, e) => {
    if (e.key === "Backspace" && !code[i] && i > 0) inputsRef.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) inputsRef.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) inputsRef.current[i + 1]?.focus();
  };
  const onPasteCode = (e) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const next = text.split("").concat(Array(6).fill("")).slice(0, 6);
    setCode(next);
    setTimeout(() => inputsRef.current?.[Math.min(text.length, 5)]?.focus(), 0);
    e.preventDefault();
  };

  return (
    <div style={sx.page}>
      <style>{`
        /* Full-bleed + no horizontal scroll */
        * { box-sizing: border-box; }
        html, body, #root { height: 100%; width: 100%; margin: 0; padding: 0; }
        body { overflow-x: hidden; }

        @keyframes bgMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      <div style={sx.center}>
        <form
          style={sx.card}
          onSubmit={step === 1 ? handleSendCode : step === 2 ? handleVerifyCode : handleResetPassword}
        >
          <div style={sx.header}>
            <h1 style={sx.h1}>Forgot Password</h1>
            <p style={sx.sub}>
              {step === 1 && "Enter your account email and we’ll send you a 6-digit code."}
              {step === 2 && <>Enter the 6-digit code sent to <b>{email}</b>.</>}
              {step === 3 && "Create a new password."}
            </p>
          </div>

          {/* Notifications */}
          {error ? <div style={{ ...sx.alert, ...sx.alertErr }}>{error}</div> : null}
          {okMsg ? <div style={{ ...sx.alert, ...sx.alertOk }}>{okMsg}</div> : null}

          {/* Step 1: Email */}
          {step === 1 && (
            <>
              <label style={sx.label} htmlFor="fp-email">Email</label>
              <input
                id="fp-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={sx.input}
                required
              />
              <button type="submit" style={sx.btnPrimary} disabled={loading}>
                {loading ? "Sending…" : "Send Code"}
              </button>
            </>
          )}

          {/* Step 2: Code */}
          {step === 2 && (
            <>
              <div style={sx.otpWrap} onPaste={onPasteCode}>
                {code.map((d, i) => (
                  <input
                    key={i}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={d}
                    onChange={(e) => onChangeDigit(i, e.target.value)}
                    onKeyDown={(e) => onKeyDownDigit(i, e)}
                    ref={(el) => (inputsRef.current[i] = el)}
                    style={sx.otpBox}
                    aria-label={`Digit ${i + 1}`}
                  />
                ))}
              </div>

              <button type="submit" style={sx.btnPrimary} disabled={loading || codeValue.length !== 6}>
                {loading ? "Verifying…" : "Verify Code"}
              </button>

              <div style={sx.actionsRow}>
                <button type="button" style={sx.btnGhost} onClick={() => setStep(1)} disabled={loading}>
                  Change email
                </button>
                <div style={{ flex: 1 }} />
                <button
                  type="button"
                  style={{ ...sx.btnGhost, ...(cooldown ? sx.btnGhostDisabled : null) }}
                  onClick={handleResend}
                  disabled={loading || cooldown > 0}
                >
                  {cooldown ? `Resend in ${cooldown}s` : "Resend code"}
                </button>
              </div>
            </>
          )}

          {/* Step 3: New password */}
          {step === 3 && (
            <>
              <label style={sx.label} htmlFor="fp-pass">New password</label>
              <div style={sx.passRow}>
                <input
                  id="fp-pass"
                  type={showPw ? "text" : "password"}
                  placeholder="At least 8 characters"
                  value={pwd.a}
                  onChange={(e) => setPwd((s) => ({ ...s, a: e.target.value }))}
                  style={sx.input}
                  required
                />
                <button
                  type="button"
                  style={sx.peek}
                  onClick={() => setShowPw((s) => !s)}
                  aria-label="Toggle password visibility"
                >
                  {showPw ? "🙈" : "👁️"}
                </button>
              </div>

              <label style={sx.label} htmlFor="fp-pass2">Confirm password</label>
              <input
                id="fp-pass2"
                type={showPw ? "text" : "password"}
                placeholder="Re-enter your password"
                value={pwd.b}
                onChange={(e) => setPwd((s) => ({ ...s, b: e.target.value }))}
                style={sx.input}
                required
              />

              <button type="submit" style={sx.btnPrimary} disabled={loading}>
                {loading ? "Saving…" : "Save New Password"}
              </button>

              <div style={sx.footerRow}>
                <button type="button" style={sx.btnLink} onClick={() => navigate("/login")}>
                  Back to sign in
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

/* ---------------- styles ---------------- */
const sx = {
  // Full-bleed, fixed background (same Frost Glow as Login/Signup)
  page: {
    position: "fixed",
    inset: 0,
    background:
      "linear-gradient(-45deg, #f9fafb, #eff6ff, #dbeafe, #bfdbfe, #a5b4fc)",
    backgroundSize: "400% 400%",
    animation: "bgMove 20s ease infinite",
    fontFamily: "Segoe UI, system-ui, -apple-system, Arial, sans-serif",
    overflowX: "hidden",
    overflowY: "auto",
  },

  center: {
    minHeight: "100%",
    width: "100%",
    display: "grid",
    placeItems: "center",
    padding: 16,
  },

  card: {
    width: "100%",
    maxWidth: 520,
    background: "#fff",
    border: "1px solid #e6eef8",
    borderRadius: 16,
    padding: 22,
    boxShadow: "0 16px 38px rgba(0,0,0,.08)",
  },
  header: { marginBottom: 8 },
  h1: { margin: 0, fontSize: 22, fontWeight: 900, color: "#0f2a3d", letterSpacing: ".2px" },
  sub: { margin: "6px 0 0", color: "#475569", fontSize: 14, lineHeight: 1.6 },
  label: { display: "block", margin: "12px 0 6px", fontWeight: 800, fontSize: 13, color: "#0f2a3d" },
  input: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #cfe0ef",
    fontSize: 15,
    outline: "none",
    background: "#fbfdff",
  },

  // Solid navy primary buttons (match Login/Signup)
  btnPrimary: {
    width: "100%",
    marginTop: 14,
    padding: "12px 16px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    fontWeight: 900,
    letterSpacing: ".2px",
    backgroundColor: "#1f3b4d",
    color: "#fff",
    boxShadow: "0 8px 22px rgba(31,59,77,.25)",
    transition: "transform .12s ease, box-shadow .12s ease",
  },

  btnGhost: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #d6e6f5",
    background: "#f6fbff",
    color: "#0f2a3d",
    fontWeight: 800,
    cursor: "pointer",
  },
  btnGhostDisabled: { opacity: 0.6, cursor: "not-allowed" },
  btnLink: { background: "transparent", border: "none", color: "#2aa5ff", cursor: "pointer", fontWeight: 800 },

  footerRow: { marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" },

  otpWrap: { display: "flex", justifyContent: "center", gap: 10, margin: "10px 0 14px", flexWrap: "nowrap" },
  otpBox: {
    width: 48,
    height: 52,
    textAlign: "center",
    fontSize: 20,
    fontWeight: 800,
    border: "1px solid #cfe0ef",
    borderRadius: 12,
    background: "#fbfdff",
    color: "#0f2a3d",
    outline: "none",
    boxShadow: "0 6px 16px rgba(0,0,0,.05)",
    transition: "border-color .12s, box-shadow .12s, transform .06s",
  },

  actionsRow: { display: "flex", alignItems: "center", gap: 10, marginTop: 12 },

  passRow: { position: "relative", display: "flex", alignItems: "center" },
  peek: { position: "absolute", right: 8, background: "transparent", border: "none", cursor: "pointer", fontSize: 18 },

  alert: { marginTop: 8, padding: "10px 12px", borderRadius: 12, fontSize: 13, fontWeight: 700 },
  alertErr: { background: "#ffecec", color: "#9b1c1c", border: "1px solid #ffcdcd" },
  alertOk: { background: "#e8f8ec", color: "#146c2e", border: "1px solid #c9eed2" },

  "@media (max-width: 460px)": { otpBox: { width: 42, height: 48 } },
};
