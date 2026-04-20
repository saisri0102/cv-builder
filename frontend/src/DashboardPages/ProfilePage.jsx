// src/DashboardPages/ProfilePage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { setAuthToken, API_BASE } from "../lib/api";

/* ---- Fixed endpoints (only /api/v1/*) ---- */
const READ_ENDPOINT = "/api/v1/profile/me";
const WRITE_CANDIDATES = [
  { method: "put",   url: "/api/v1/profile/me" },
  { method: "put",   url: "/api/v1/profile"   },
  { method: "post",  url: "/api/v1/profile"   },
  { method: "patch", url: "/api/v1/profile"   }, // compatibility fallback
];

const isValidEmail = (e) => typeof e === "string" && /\S+@\S+\.\S+/.test(e);

function normalizeError(errLike) {
  try {
    const detail =
      errLike?.response?.data?.detail ??
      errLike?.response?.data ??
      errLike?.message ??
      errLike;

    if (Array.isArray(detail)) {
      return detail
        .map((d) => {
          const loc =
            d && typeof d === "object" && Array.isArray(d.loc)
              ? d.loc.join(".")
              : d?.loc ?? "";
          return `${loc || "error"}: ${d?.msg || d?.type || "error"}`;
        })
        .join(" | ");
    }
    if (detail && typeof detail === "object") {
      if (detail.msg) {
        const loc = Array.isArray(detail.loc) ? detail.loc.join(".") : detail.loc ?? "";
        return `${loc || "error"}: ${detail.msg}`;
      }
      try {
        return JSON.stringify(detail);
      } catch {
        return String(detail);
      }
    }
    return String(detail);
  } catch {
    return "Unexpected error";
  }
}

/* ---------- helpers used before component ---------- */
function emptyProfile() {
  return {
    full_name: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",
    summary: "",
    skills: [],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    // extras_text kept in state, but not shown in UI
    extras_text: "",
  };
}

function safeJSONString(obj) {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return "";
  }
}

function normalizeIncoming(raw) {
  const d = raw?.profile ? raw.profile : raw || {};
  const extrasGuess = d?.extras ?? d?.meta ?? undefined;
  return {
    id: d?.id ?? null,
    full_name: d?.full_name || d?.name || "",
    email: d?.email || "",
    phone: d?.phone || "",
    location: d?.location || "",
    linkedin: d?.linkedin || d?.linked_in || "",
    github: d?.github || "",
    portfolio: d?.portfolio || d?.website || "",
    summary: d?.summary || d?.about || "",
    skills: Array.isArray(d?.skills) ? d.skills : extrasGuess?.skills || [],
    experience: Array.isArray(d?.experience) ? d.experience : extrasGuess?.experience || [],
    projects: Array.isArray(d?.projects) ? d.projects : extrasGuess?.projects || [],
    education: Array.isArray(d?.education) ? d.education : extrasGuess?.education || [],
    certifications: Array.isArray(d?.certifications) ? d.certifications : extrasGuess?.certifications || [],
    extras_text: extrasGuess ? safeJSONString(extrasGuess) : "",
  };
}

/* ======= send arrays BOTH at top-level and inside extras (compat) ======= */
function toPayload(fIn) {
  const f = fIn || {};
  const trimOrNull = (v) =>
    typeof v === "string" ? v.trim() : v == null ? null : String(v).trim();

  const base = {
    full_name: trimOrNull(f.full_name) || "",
    email: trimOrNull(f.email) || "",
    phone: trimOrNull(f.phone),
    location: trimOrNull(f.location),
    linkedin: trimOrNull(f.linkedin),
    github: trimOrNull(f.github),
    portfolio: trimOrNull(f.portfolio),
    summary: typeof f.summary === "string" ? f.summary : null,
    about: typeof f.summary === "string" ? f.summary : null, // compatibility alias
  };

  const arrays = {
    skills: Array.isArray(f.skills) ? f.skills : [],
    experience: Array.isArray(f.experience) ? f.experience : [],
    projects: Array.isArray(f.projects) ? f.projects : [],
    education: Array.isArray(f.education) ? f.education : [],
    certifications: Array.isArray(f.certifications) ? f.certifications : [],
  };

  const extras = { ...arrays };
  if (typeof f.extras_text === "string" && f.extras_text.trim()) {
    try {
      Object.assign(extras, JSON.parse(f.extras_text));
    } catch {
      extras.note = f.extras_text;
    }
  }

  const payload = { ...base, ...arrays, extras };
  Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
  return payload;
}
/* ======================================================================= */

function deriveInitials(name) {
  let n = typeof name === "string" ? name : name == null ? "" : String(name);
  n = n.trim();
  if (!n) return "";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ---------- component ---------- */
export default function ProfilePage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [writeEndpoint, setWriteEndpoint] = useState("");

  const [form, setForm] = useState(() => emptyProfile());

  // Ensure Authorization is set on mount
  useEffect(() => {
    const t = localStorage.getItem("token") || localStorage.getItem("access_token");
    const type = localStorage.getItem("token_type") || "Bearer";
    if (!t) {
      setErr("You’re not logged in. Please sign in.");
      setLoading(false);
      return;
    }
    setAuthToken(t, type);
    loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProfile() {
    setLoading(true);
    setErr("");
    setOk("");
    try {
      const { data, status } = await api.get(READ_ENDPOINT, {
        headers: { Accept: "application/json" },
        validateStatus: () => true,
      });

      if (status === 200) {
        setForm(normalizeIncoming(data));
      } else if (status === 204 || data == null || data === "") {
        setForm(emptyProfile());
      } else if (status === 401) {
        setErr("Session expired. Please sign in again.");
      } else if (status === 404) {
        setForm(emptyProfile());
      } else {
        throw { response: { data } };
      }
    } catch (e) {
      setErr(normalizeError(e) || "Failed to load profile.");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    if (!form.full_name || !String(form.full_name).trim()) {
      setErr("Full name is required.");
      return;
    }
    if (!isValidEmail(form.email)) {
      setErr("Please enter a valid email (e.g., name@example.com).");
      return;
    }

    setSaving(true);
    setErr("");
    setOk("");

    const payload = toPayload(form);

    let lastErr = null;
    for (const c of WRITE_CANDIDATES) {
      try {
        const { status } = await api.request({
          method: c.method,
          url: c.url,
          data: payload,
          headers: { "Content-Type": "application/json" },
          validateStatus: () => true,
        });

        if (status === 401) {
          lastErr = new Error("Unauthorized – please sign in and try again.");
          break;
        }

        if (status === 200 || status === 201 || status === 204) {
          // Always reload canonical profile after success
          setWriteEndpoint(`${API_BASE}${c.url}`);
          await loadProfile();
          setOk("Profile saved!");
          setSaving(false);
          return;
        }

        lastErr = new Error(`${c.method.toUpperCase()} ${c.url} -> ${status}`);
      } catch (e) {
        lastErr = e;
        break;
      }
    }

    setSaving(false);
    setErr(normalizeError(lastErr) || "Failed to save profile.");
  }

  const initials = useMemo(() => deriveInitials(form?.full_name ?? ""), [form.full_name]);

  if (loading) {
    return (
      <div style={sx.page}>
        <style>{styles}</style>
        <div className="skeleton">
          <div className="skeleton-banner" />
          <div className="skeleton-card" />
          <div className="skeleton-card" />
          <div className="skeleton-card" />
        </div>
      </div>
    );
  }

  return (
    <div style={sx.page}>
      <style>{styles}</style>

      {/* Clean, minimal header (accent line) */}
      <div className="hero">
        <div className="hero-inner">
          <div className="pf-avatar pf-avatar-xl" title={form.full_name || "Your name"}>
            {initials || "👤"}
          </div>
          <div className="hero-text">
            <h1 className="pf-title">My Profile</h1>
            <div className="pf-sub">
              Keep your details tidy — we use this info to auto-fill resumes & cover letters.
            </div>
            <div className="pf-meta">
              <span><strong>Last write to:</strong> {writeEndpoint || "—"}</span>
            </div>
          </div>
          <div className="hero-actions">
            <button className="btn ghost" onClick={() => navigate(-1)}>Cancel</button>
            <button className="btn primary" onClick={saveProfile} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {err && (<div className="pf-banner error"><strong>Error:</strong> <span>{err}</span></div>)}
      {ok && (<div className="pf-banner ok"><strong>{ok}</strong></div>)}

      {/* Contact */}
      <section className="pf-card">
        <h2>👤 Contact & Links</h2>
        <div className="grid2">
          <Input label="Full name" value={form.full_name} onChange={(v) => setForm((f) => ({ ...f, full_name: v }))} required />
          <Input label="Email" type="email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} required />
          <Input label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
          <Input label="Location" value={form.location} onChange={(v) => setForm((f) => ({ ...f, location: v }))} />
          <Input label="LinkedIn" value={form.linkedin} onChange={(v) => setForm((f) => ({ ...f, linkedin: v }))} />
          <Input label="GitHub" value={form.github} onChange={(v) => setForm((f) => ({ ...f, github: v }))} />
          <Input label="Portfolio" value={form.portfolio} onChange={(v) => setForm((f) => ({ ...f, portfolio: v }))} className="span2" />
        </div>
      </section>

      {/* Summary */}
      <section className="pf-card">
        <h2>📝 Professional Summary</h2>
        <Textarea
          value={form.summary}
          onChange={(v) => setForm((f) => ({ ...f, summary: v }))}
          placeholder="2–4 lines that sell your value"
          rows={4}
        />
      </section>

      {/* Skills */}
      <section className="pf-card">
        <h2>💡 Skills <span className="hint">(press Enter to add)</span></h2>
        <Chips
          value={form.skills}
          onChange={(arr) => setForm((f) => ({ ...f, skills: arr }))}
          placeholder="e.g., Python, SQL, Java, React"
        />
      </section>

      {/* Experience */}
      <section className="pf-card">
        <h2>💼 Experience</h2>
        <List
          items={form.experience}
          onChange={(arr) => setForm((f) => ({ ...f, experience: arr }))}
          renderItem={(item, idx, update, remove) => (
            <div className="grid2">
              <Input label="Company" value={item.company || ""} onChange={(v) => update({ ...item, company: v })} required />
              <Input label="Title" value={item.title || ""} onChange={(v) => update({ ...item, title: v })} required />
              <Input label="Start" value={item.start || ""} onChange={(v) => update({ ...item, start: v })} placeholder="2022-05 or May 2022" />
              <Input label="End" value={item.end || ""} onChange={(v) => update({ ...item, end: v })} placeholder="Present or 2024-08" />
              <Input label="Location" value={item.location || ""} onChange={(v) => update({ ...item, location: v })} />
              <Bullets
                label="Impact bullets"
                value={Array.isArray(item.bullets) ? item.bullets : []}
                onChange={(v) => update({ ...item, bullets: v })}
              />
              <div className="row-right span2">
                <button className="btn danger ghost" onClick={remove}>Remove role</button>
              </div>
            </div>
          )}
          makeNew={() => ({ company: "", title: "", start: "", end: "", location: "", bullets: [] })}
        />
      </section>

      {/* Projects */}
      <section className="pf-card">
        <h2>🚀 Projects</h2>
        <List
          items={form.projects}
          onChange={(arr) => setForm((f) => ({ ...f, projects: arr }))}
          renderItem={(item, idx, update, remove) => (
            <div className="grid2">
              <Input label="Name" value={item.name || ""} onChange={(v) => update({ ...item, name: v })} required />
              <Chips
                label="Stack / tags"
                value={Array.isArray(item.stack) ? item.stack : []}
                onChange={(v) => update({ ...item, stack: v })}
                placeholder="e.g., React, Node, SQL"
              />
              <Bullets
                label="Highlights"
                value={Array.isArray(item.bullets) ? item.bullets : []}
                onChange={(v) => update({ ...item, bullets: v })}
              />
              <div className="row-right span2">
                <button className="btn danger ghost" onClick={remove}>Remove project</button>
              </div>
            </div>
          )}
          makeNew={() => ({ name: "", stack: [], bullets: [] })}
        />
      </section>

      {/* Education */}
      <section className="pf-card">
        <h2>🎓 Education</h2>
        <List
          items={form.education}
          onChange={(arr) => setForm((f) => ({ ...f, education: arr }))}
          renderItem={(item, idx, update, remove) => (
            <div className="grid2">
              <Input label="Degree" value={item.degree || ""} onChange={(v) => update({ ...item, degree: v })} required />
              <Input label="School" value={item.school || ""} onChange={(v) => update({ ...item, school: v })} required />
              <Input label="Year" value={item.year || ""} onChange={(v) => update({ ...item, year: v })} />
              <Bullets
                label="Details"
                value={Array.isArray(item.details) ? item.details : []}
                onChange={(v) => update({ ...item, details: v })}
              />
              <div className="row-right span2">
                <button className="btn danger ghost" onClick={remove}>Remove education</button>
              </div>
            </div>
          )}
          makeNew={() => ({ degree: "", school: "", year: "", details: [] })}
        />
      </section>

      {/* Certifications */}
      <section className="pf-card">
        <h2>🏅 Certifications</h2>
        <List
          items={form.certifications}
          onChange={(arr) => setForm((f) => ({ ...f, certifications: arr }))}
          renderItem={(item, idx, update, remove) => (
            <div className="grid2">
              <Input label="Name" value={item.name || ""} onChange={(v) => update({ ...item, name: v })} required />
              <Input label="Year" value={item.year || ""} onChange={(v) => update({ ...item, year: v })} />
              <Input label="Organization" value={item.org || ""} onChange={(v) => update({ ...item, org: v })} />
              <div className="row-right span2">
                <button className="btn danger ghost" onClick={remove}>Remove certification</button>
              </div>
            </div>
          )}
          makeNew={() => ({ name: "", year: "", org: "" })}
        />
      </section>
    </div>
  );
}

/* ---------- tiny UI primitives ---------- */
function Input({ label, className, onChange, required, ...props }) {
  return (
    <label className={`pf-label ${className || ""}`}>
      <span>
        {label} {required && <em className="req">*</em>}
      </span>
      <input
        className="pf-input"
        {...props}
        onChange={(e) => onChange && onChange(e.target.value)}
      />
    </label>
  );
}

function Textarea({ label, value, onChange, rows = 3, placeholder }) {
  return (
    <label className="pf-label">
      {label && <span>{label}</span>}
      <textarea
        className="pf-textarea"
        rows={rows}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function Chips({ label, value, onChange, placeholder }) {
  const [text, setText] = useState("");
  const items = Array.isArray(value) ? value : [];
  function addChip() {
    const t = text.trim();
    if (!t) return;
    const next = Array.from(new Set([...(items || []), t]));
    onChange && onChange(next);
    setText("");
  }
  function removeChip(i) {
    const next = items.filter((_, idx) => idx !== i);
    onChange && onChange(next);
  }
  return (
    <div className="chips">
      {label && <div className="chips-label">{label}</div>}
      <div className="chips-row">
        {(items || []).map((s, i) => (
          <span key={i} className="chip" onClick={() => removeChip(i)} title="Click to remove">
            {s} ✕
          </span>
        ))}
        <input
          className="chips-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChip();
            }
          }}
          placeholder={placeholder || "Type and press Enter"}
        />
        <button className="btn pill ghost" onClick={addChip}>Add</button>
      </div>
    </div>
  );
}

/* ==== Bullets: Input + Add button + removable list (preserves spaces) ==== */
function Bullets({ label, value, onChange }) {
  const items = Array.isArray(value) ? value : [];
  const [text, setText] = useState("");

  function add() {
    const t = (text ?? "").replace(/\r?\n/g, " ").trim();
    if (!t) return;
    onChange && onChange([...(items || []), t]);
    setText("");
  }
  function remove(i) {
    onChange && onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <div className="bullets span2">
      <div className="chips-label">{label || "Bullets"}</div>

      <div className="bullets-list">
        {(items || []).map((b, i) => (
          <div key={i} className="bullet-item">
            <span>• {b}</span>
            <button className="link danger" onClick={() => remove(i)}>remove</button>
          </div>
        ))}
      </div>

      <div className="bullets-add">
        <input
          className="pf-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add a quantified impact bullet and press Add (Enter works too)"
        />
        <button className="btn ghost" onClick={add}>Add</button>
      </div>
    </div>
  );
}
/* ======================================================================= */

function List({ items, onChange, renderItem, makeNew }) {
  const arr = Array.isArray(items) ? items : [];
  function add() {
    onChange && onChange([...(arr || []), makeNew()]);
  }
  function updateAt(idx, next) {
    onChange && onChange(arr.map((it, i) => (i === idx ? next : it)));
  }
  function removeAt(idx) {
    onChange && onChange(arr.filter((_, i) => i !== idx));
  }
  return (
    <div className="list">
      {arr.length === 0 && <div className="empty">No items yet.</div>}
      {arr.map((item, idx) => (
        <div key={idx} className="list-item">
          {renderItem(item, idx, (next) => updateAt(idx, next), () => removeAt(idx))}
        </div>
      ))}
      <div className="row-right">
        <button className="btn ghost" onClick={add}>Add item</button>
      </div>
    </div>
  );
}

/* ---------- styles ---------- */
const sx = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "12px 18px 32px" },
};

const styles = `
  :root {
    --bg: #f7f9fc;
    --card: #ffffff;
    --text: #0f172a;
    --muted: #6b7280;
    --line: #e6eaf2;
    --brand: #2563eb;
    --brand2: #0ea5e9;
    --brand-dark: #1f3b4d;
    --accent: #98c6ff;
    --ok-bg: #ecfdf5;
    --ok-text: #065f46;
    --ok-line: #a7f3d0;
    --err-bg: #fee2e2;
    --err-text: #b91c1c;
    --err-line: #fecaca;
    --ring: rgba(59,130,246,.35);
    --chip-bg: #e8f1ff;
    --chip-text: #1e40af;
    --shadow: 0 8px 18px rgba(2, 6, 23, 0.06);
  }

  html, body { background: var(--bg); color: var(--text); }
  *, *::before, *::after { box-sizing: border-box; }

  /* Clean, minimal Hero (no big color bar) */
  .hero {
    position: relative;
    border-radius: 14px;
    overflow: hidden;
    margin: 10px 0 18px;
    border: 1px solid var(--line);
    background: #fff;
    box-shadow: 0 8px 18px rgba(2,6,23,.06);
    padding: 14px 18px;
  }
  /* Thin accent line on top */
  .hero::before{
    content:"";
    position:absolute; left:0; right:0; top:0;
    height:4px;
    border-top-left-radius:14px; border-top-right-radius:14px;
    background: linear-gradient(90deg, var(--brand), var(--brand2));
  }
  /* Remove old big banner if any */
  .hero-bg { display:none; }

  .hero-inner { display:grid; grid-template-columns: auto 1fr auto; gap:16px; align-items:center; }
  .pf-avatar { width:44px; height:44px; border-radius:50%; background:var(--brand-dark); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:800; }
  .pf-avatar.pf-avatar-xl { width:64px; height:64px; font-size:20px; }
  .pf-title { margin:0; font-size:22px; letter-spacing:.2px; }
  .pf-sub { font-size:13px; color:var(--muted); margin-top:4px; }
  .pf-meta { font-size:12px; color:var(--muted); margin-top:6px; }

  .hero-actions { display:flex; gap:10px; }
  .btn { background:var(--brand-dark); color:#fff; border:none; padding:10px 14px; border-radius:10px; cursor:pointer; font-weight:700; box-shadow: var(--shadow); transition: transform .06s ease, box-shadow .2s ease, background .2s ease; }
  .btn:hover { transform: translateY(-1px); box-shadow: 0 10px 20px rgba(2,6,23,.09); }
  .btn:disabled { opacity:.6; cursor:default; transform:none; }
  .btn.ghost { background:#fff; color:var(--brand-dark); border:1px solid #dbe4ef; }
  .btn.primary { background: linear-gradient(135deg, var(--brand), var(--brand2)); }
  .btn.pill { border-radius:999px; padding:8px 12px; font-weight:600; }
  .btn.danger { color:#d22; border-color:#d22; }
  .btn.danger.ghost { color:#d22; border:1px solid #d22; background:#fff; }

  .pf-banner { border-radius:12px; padding:10px 12px; margin: 10px 0 6px; border:1px solid; }
  .pf-banner.ok { background:var(--ok-bg); color:var(--ok-text); border-color:var(--ok-line); }
  .pf-banner.error { background:var(--err-bg); color:var(--err-text); border-color:var(--err-line); }

  /* Cards */
  .pf-card { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:16px; margin:14px 0; box-shadow: var(--shadow); }
  .pf-card > h2 { margin:0 0 12px; font-size:16px; letter-spacing:.2px; display:flex; align-items:center; gap:8px; }
  .hint { color:var(--muted); font-size:12px; font-weight:500; }

  /* Layout helpers */
  .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap:12px; align-items:start; }
  .span2 { grid-column: 1 / -1; }
  .grid2 > * { min-width: 0; }
  .row-right { display:flex; justify-content:flex-end; }

  /* Form */
  .pf-label { display:flex; flex-direction:column; gap:6px; min-width:0; font-weight:600; }
  .pf-label > span { font-size:12px; color:#334155; }
  .req { color:#ef4444; font-style: normal; margin-left: 4px; }
  .pf-input, .pf-textarea {
    width:100%;
    border:1px solid #d6deea;
    border-radius:10px;
    padding:10px 12px;
    font-size:14px;
    background:#ffffff;
    outline: none;
    transition: box-shadow .15s ease, border-color .15s ease, background .2s ease;
  }
  .pf-textarea { min-height: 110px; }
  .pf-input:focus, .pf-textarea:focus {
    border-color:#bfd6ff;
    box-shadow: 0 0 0 4px var(--ring);
    background: #fff;
  }

  /* Chips */
  .chips { display:flex; flex-direction:column; gap:8px; min-width:0; }
  .chips-label { font-size:12px; color:#334155; font-weight:600; }
  .chips-row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .chips-input { border:1px solid #d6deea; border-radius:999px; padding:8px 12px; flex:1 1 160px; min-width:0; }
  .chip { background:var(--chip-bg); color:var(--chip-text); padding:6px 10px; border-radius:999px; cursor:pointer; user-select:none; border:1px solid #cfe0ff; transition: transform .06s; }
  .chip:hover { transform: translateY(-1px); }

  /* Bullets */
  .bullets { display:flex; flex-direction:column; gap:10px; }
  .bullets-list { display:flex; flex-direction:column; gap:6px; margin-top: 2px; }
  .bullet-item { display:flex; align-items:center; justify-content:space-between; gap:8px; background:#f8fafc; border:1px solid #eef2f7; border-radius:10px; padding:8px 10px; }
  .bullets-add { display:flex; gap:8px; align-items:center; margin-top: 6px; }
  .bullets-add .pf-input { flex: 1 1 auto; }

  /* List */
  .list { display:flex; flex-direction:column; gap:12px; }
  .list-item { background:#fbfbff; border:1px solid #edf0f7; border-radius:12px; padding:12px; }

  /* Skeleton (loading) */
  .skeleton-banner { height:140px; background: linear-gradient(90deg, #eef2f7 25%, #f6f8fb 37%, #eef2f7 63%); background-size: 400% 100%; animation: shimmer 1.2s infinite; border-radius:18px; margin-bottom:16px; }
  .skeleton-card { height:120px; background: linear-gradient(90deg, #eef2f7 25%, #f6f8fb 37%, #eef2f7 63%); background-size: 400% 100%; animation: shimmer 1.2s infinite; border-radius:16px; margin:12px 0; border:1px solid var(--line); }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  @media (max-width: 980px) {
    .hero-inner { grid-template-columns: auto 1fr; grid-template-areas: "avatar text" "actions actions"; gap: 12px; }
    .hero-actions { grid-area: actions; justify-content: flex-end; }
    .grid2 { grid-template-columns: 1fr; }
    .span2 { grid-column: 1 / -1; }
  }
`;
