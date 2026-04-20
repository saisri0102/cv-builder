// src/pages/ChangePasswordPage.js
import React, { useState } from "react";

/** Minimal API helper (self-contained). */
const BASE = process.env.REACT_APP_API_BASE || "/api/v1";
async function apiRequest(path, method = "GET", body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const msg = data?.message || data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

const ChangePasswordPage = () => {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");

  const passwordOk = next.length >= 8 && /[A-Za-z]/.test(next) && /\d/.test(next);

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(""); setOk(false);
    if (!passwordOk) return setErr("Password must be at least 8 characters and include a letter and a number.");
    if (next !== confirm) return setErr("New password and confirmation do not match.");
    setLoading(true);
    try {
      await apiRequest("/auth/change-password", "POST", { currentPassword: current, newPassword: next });
      setOk(true);
      setCurrent(""); setNext(""); setConfirm("");
    } catch (e) {
      setErr(e.message || "Current password is incorrect or request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <form style={s.card} onSubmit={onSubmit}>
        <h1 style={s.h1}>Change Password</h1>
        <p style={s.p}>Update your password using your current one. No email link required.</p>

        {ok && <p style={{...s.p, color:"#0a7d27", fontWeight:700}}>✅ Password updated successfully.</p>}
        {err && <p style={{...s.p, color:"#b42318", fontWeight:700}}>⚠ {err}</p>}

        <label style={s.label}>Current password</label>
        <div style={s.passWrap}>
          <input
            type={show ? "text" : "password"}
            value={current}
            onChange={(e)=>setCurrent(e.target.value)}
            style={s.input}
            required
          />
        </div>

        <label style={s.label}>New password</label>
        <div style={s.passWrap}>
          <input
            type={show ? "text" : "password"}
            value={next}
            onChange={(e)=>setNext(e.target.value)}
            style={s.input}
            required
            aria-describedby="pwd-help"
          />
        </div>
        <small id="pwd-help" style={s.help}>
          Must be 8+ chars, include a letter and a number.
        </small>

        <label style={s.label}>Confirm new password</label>
        <div style={s.passWrap}>
          <input
            type={show ? "text" : "password"}
            value={confirm}
            onChange={(e)=>setConfirm(e.target.value)}
            style={s.input}
            required
          />
        </div>

        <div style={s.row}>
          <label style={s.check}>
            <input type="checkbox" checked={show} onChange={()=>setShow(!show)} /> Show passwords
          </label>
        </div>

        <button type="submit" style={s.btn} disabled={loading}>
          {loading ? "Saving…" : "Save Password"}
        </button>
      </form>
    </div>
  );
};

const s = {
  page:{display:"flex",alignItems:"center",justifyContent:"center",minHeight:"100vh",
    background:"linear-gradient(135deg,#e6f0f8 0%,#f7fbff 100%)",padding:16},
  card:{background:"#fff",padding:"28px 24px",borderRadius:16,maxWidth:480,width:"100%",
    boxShadow:"0 14px 34px rgba(0,0,0,.12)"},
  h1:{margin:"0 0 8px",fontSize:24,fontWeight:800,color:"#13293d"},
  p:{margin:"0 0 14px",fontSize:15,color:"#475569",lineHeight:1.5},
  label:{display:"block",fontSize:13,fontWeight:700,color:"#0f2a3d",margin:"8px 0 6px"},
  input:{width:"100%",padding:"12px 14px",borderRadius:10,border:"1px solid #cfe0ef",fontSize:15},
  passWrap:{position:"relative"},
  help:{display:"block",color:"#64748b",margin:"6px 0 10px"},
  row:{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"6px 0 14px"},
  check:{fontSize:14,color:"#334155"},
  btn:{width:"100%",padding:"12px 18px",borderRadius:10,border:"none",
    background:"linear-gradient(180deg,#2aa5ff 0%, #1998f7 100%)",color:"#0b1722",
    fontWeight:800,fontSize:15,cursor:"pointer",boxShadow:"0 10px 28px rgba(42,165,255,.28)"},
};

export default ChangePasswordPage;
