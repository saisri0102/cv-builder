// src/DashboardPages/ResumeCoverGenerator.jsx
import React, { useState } from "react";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx";
import { jsPDF } from "jspdf";

/* -------------------- API base (CRA or Vite) -------------------- */
const RAW_API =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  "http://127.0.0.1:8000";
const API_BASE = String(RAW_API).replace(/\/+$/, "");

/* -------------------- Small utils -------------------- */
const stripCodeFences = (s = "") =>
  String(s).replace(/^```[a-z]*\s*|\s*```$/gim, "").trim();

function safeText(v) {
  return v == null
    ? ""
    : typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    ? String(v)
    : JSON.stringify(v);
}

function normalizeError(errLike) {
  try {
    const status =
      errLike?.response?.status || errLike?.status || errLike?.response?.data?.status;
    const detail =
      errLike?.response?.data?.detail ??
      errLike?.response?.data ??
      errLike?.data?.detail ??
      errLike?.data ??
      errLike?.message ??
      errLike;

    let msg;
    if (Array.isArray(detail)) {
      msg = detail
        .map((d) => {
          const loc = Array.isArray(d.loc) ? d.loc.join(".") : d.loc;
          return `${loc || "error"}: ${d.msg || d.type || "error"}`;
        })
        .join(" | ");
    } else if (detail && typeof detail === "object") {
      if (detail.msg) {
        const loc = Array.isArray(detail.loc) ? detail.loc.join(".") : detail.loc;
        msg = `${loc || "error"}: ${detail.msg}`;
      } else {
        msg = JSON.stringify(detail);
      }
    } else {
      msg = String(detail ?? "Unknown error");
    }

    if (status === 401 || status === 403) {
      return `Missing or invalid Authorization header. Please log in again. (${msg})`;
    }
    return msg;
  } catch {
    return "Unexpected error";
  }
}

function detectDocTypeFromCommand(cmd = "") {
  const lc = cmd.toLowerCase();
  const mentionsResume = /(resume|cv)\b/.test(lc);
  const mentionsCover = /(cover\s*letter|cover-letter|cover)\b/.test(lc);
  if (mentionsResume && mentionsCover) return "both";
  if (mentionsCover) return "cover";
  if (mentionsResume) return "resume";
  return "both";
}

/* ---------- Remove CONTACT section from plain text ---------- */
function stripContactSection(input) {
  const text = String(input || "");
  if (!text) return "";

  const HEADINGS = [
    "CONTACT",
    "PROFESSIONAL SUMMARY",
    "SUMMARY",
    "CORE SKILLS",
    "TECHNICAL SKILLS",
    "SKILLS",
    "PROJECTS",
    "PROFESSIONAL EXPERIENCE",
    "WORK EXPERIENCE",
    "EXPERIENCE",
    "EDUCATION",
    "CERTIFICATIONS",
    "ACHIEVEMENTS",
  ];

  const headingRegex = new RegExp(
    `^\\s*(?:${HEADINGS.map((h) => h.replace(/ /g, "[\\s_-]+")).join("|")})\\s*:?$`,
    "i"
  );

  const lines = text.split(/\r?\n/);
  const out = [];
  let skipping = false;

  const looksLikeAllCapsHeading = (line) =>
    /^[A-Z0-9 &\-]{3,}$/.test(line.trim()) && line.trim().length <= 50;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    const lc = line.toLowerCase().replace(/:$/, "");

    if (!skipping && lc === "contact") {
      skipping = true;
      continue;
    }

    if (skipping) {
      if (headingRegex.test(line) || looksLikeAllCapsHeading(line)) {
        skipping = false;
        out.push(raw);
      }
      continue;
    }

    if (lc === "contact") continue;
    out.push(raw);
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------- DOCX builder ---------- */
function buildDocxChildrenFromText(rawInput) {
  const raw = String(rawInput || "").trim();
  const HEADINGS = [
    "CONTACT",
    "PROFESSIONAL SUMMARY",
    "SUMMARY",
    "CORE SKILLS",
    "TECHNICAL SKILLS",
    "SKILLS",
    "PROJECTS",
    "PROFESSIONAL EXPERIENCE",
    "WORK EXPERIENCE",
    "EXPERIENCE",
    "EDUCATION",
    "CERTIFICATIONS",
    "ACHIEVEMENTS",
  ];

  const looksLikeCoverLetter = /^ *(dear\b|to (the )?hiring manager\b)/i.test(raw);

  let text = raw.replace(/\r\n/g, "\n");
  const newlineCount = (text.match(/\n/g) || []).length;

  if (newlineCount < 3) {
    const headingsRe = new RegExp(
      `\\b(${HEADINGS.map((h) => h.replace(/ /g, "\\s+")).join("|")})\\b`,
      "gi"
    );
    text = text
      .replace(/\s*•\s*/g, "\n• ")
      .replace(/(^|[^\d])-\s+(?=[A-Za-z])/g, (_m, g1) => `${g1}\n- `)
      .replace(/(?:^|\s)(\d{1,2}\.)\s+(?=[A-Za-z])/g, (m) => `\n${m.trim()} `)
      .replace(/\s+\|\s+/g, "  •  ")
      .replace(headingsRe, (m) => `\n\n${m}\n`);
  }

  if (looksLikeCoverLetter && newlineCount < 3) {
    const sentences = text.replace(/\s+/g, " ").split(/(?<=\.)\s+(?=[A-Z])/);
    text = sentences
      .reduce((acc, s) => {
        const last = acc[acc.length - 1] || "";
        if (last.length < 300) acc[acc.length - 1] = (last ? last + " " : "") + s.trim();
        else acc.push(s.trim());
        return acc;
      }, [""])
      .filter(Boolean)
      .join("\n\n");
  }

  let lines = text.split("\n");
  const sectionHeadings = new Set(HEADINGS.map((h) => h.toLowerCase()));
  const children = [];

  const looksLikeHeading = (s) => {
    const t = String(s || "").trim();
    if (!t) return false;
    const lc = t.toLowerCase().replace(/:$/, "");
    if (sectionHeadings.has(lc)) return true;
    return /^[A-Z0-9 &\-]{3,}$/.test(t) && t.length <= 50;
  };

  const isContacty = (s) =>
    /@|linkedin|github|portfolio|www|http|\d{7,}/i.test(s) ||
    (/^[A-Z ,.'\-]{6,}$/.test(s) && /\s[A-Z]/.test(s));

  const isHeadingLine = (s) =>
    sectionHeadings.has(String(s).trim().toLowerCase().replace(/:$/, ""));

  // Build a centered contact block from the very top if present
  const contactChunk = [];
  let idx = 0;
  while (idx < lines.length) {
    const l = lines[idx].trim();
    if (!l) { idx++; continue; }
    if (isHeadingLine(l)) break;
    if (isContacty(l)) {
      contactChunk.push(l);
      idx++;
      continue;
    }
    break;
  }

  if (contactChunk.length) {
    const merged = contactChunk.join("  •  ");
    children.push(
      new Paragraph({
        children: [new TextRun({ text: merged, bold: true })],
        spacing: { after: 200 },
        alignment: "center",
      })
    );
    lines = lines.slice(idx);
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) {
      children.push(new Paragraph({ spacing: { after: 180 } }));
      continue;
    }

    const lcLine = line.toLowerCase().replace(/:$/, "");
    if (lcLine === "contact") {
      let j = i + 1;
      while (j < lines.length) {
        const t = lines[j].trim();
        if (!t) { j++; continue; }
        if (looksLikeHeading(t)) break;
        j++;
      }
      i = j - 1;
      continue;
    }

    if (/^[A-Z0-9 &\-]{3,}$/.test(line) && line.length <= 50) {
      children.push(
        new Paragraph({
          text: line.toUpperCase(),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 120 },
        })
      );
      continue;
    }

    if (sectionHeadings.has(lcLine)) {
      children.push(
        new Paragraph({
          text: line.toUpperCase(),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 120 },
        })
      );
      continue;
    }

    if (/^([•\-*])\s+/.test(line)) {
      const t = line.replace(/^([•\-*])\s+/, "");
      children.push(new Paragraph({ text: t, bullet: { level: 0 }, spacing: { after: 80 } }));
      continue;
    }
    if (/^\d{1,2}\.\s+/.test(line)) {
      const t = line.replace(/^\d{1,2}\.\s+/, "");
      children.push(new Paragraph({ text: t, bullet: { level: 0 }, spacing: { after: 80 } }));
      continue;
    }

    if (/^[A-Za-z][A-Za-z\s]+:\s/.test(line)) {
      const [label, ...rest] = line.split(":");
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${label.trim()}:`, bold: true }),
            new TextRun({ text: ` ${rest.join(":").trim()}` }),
          ],
          spacing: { after: 120 },
        })
      );
      continue;
    }

    children.push(new Paragraph({ children: [new TextRun(line)], spacing: { after: 120 } }));
  }

  return children;
}

/* -------------------- Component -------------------- */
export default function ResumeCoverGenerator() {
  const [command, setCommand] = useState("");
  const [jdText, setJdText] = useState("");
  const [docType, setDocType] = useState("auto");

  const [useProfile, setUseProfile] = useState(true);
  const [overrides, setOverrides] = useState({
    full_name: "",
    email: "",
    phone: "",
    location: "",
    linkedin: "",
    github: "",
    portfolio: "",
    // You can add per-run section overrides later:
    // summary: "", skills: "", experience: "", education: "", certifications: "", projects: ""
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [resumeText, setResumeText] = useState("");
  const [coverText, setCoverText] = useState("");

  const jdWords = jdText.trim() ? jdText.trim().split(/\s+/).length : 0;

  /* -------------------- Network helpers -------------------- */
  const getToken = () => {
    const t1 = (localStorage.getItem("access_token") || "").trim();
    const t2 = (localStorage.getItem("token") || "").trim();
    return t1 || t2;
  };

  async function postJSON(url, body, opts = {}) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      body: JSON.stringify(body),
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = { detail: await res.text() };
    }
    if (!res.ok) {
      const e = new Error(`HTTP ${res.status}`);
      e.response = { status: res.status, data };
      throw e;
    }
    return data;
  }

  async function postJSONAuth(url, body) {
    const token = getToken();
    if (!token) {
      const e = new Error("No token");
      e.response = { status: 401, data: { detail: "No JWT in localStorage" } };
      throw e;
    }
    return postJSON(url, body, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function postJSONMaybeAuth(url, body) {
    const token = getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return postJSON(url, body, { headers });
  }

  /* -------------------- Helpers: build payload -------------------- */
  function buildGeneratePayload() {
    const resolvedType = docType === "auto" ? detectDocTypeFromCommand(command) : docType;

    // Keep only filled overrides
    const cleanOverrides = Object.fromEntries(
      Object.entries(overrides).filter(([_, v]) => String(v || "").trim() !== "")
    );

    // Backend expects these keys:
    const payload = {
      docType: resolvedType,                 // "resume" | "cover" | "both"
      useProfile: !!useProfile,              // requires Bearer token when true
      jobDescription: jdText || "",          // goes to guidance
      role: (command || "").trim(),          // explicit role/target (optional)
      overrides: cleanOverrides,             // contact + (optional) section overrides
    };

    return payload;
  }

  /* -------------------- Generate -------------------- */
  const onGenerate = async () => {
    if (!command.trim() && !jdText.trim()) {
      alert("Please type a command or paste a JD.");
      return;
    }
    setLoading(true);
    setError("");
    setResumeText("");
    setCoverText("");

    try {
      const payload = buildGeneratePayload();
      const data = await postJSONMaybeAuth(`${API_BASE}/api/v1/resume-cover`, payload);

      const resume =
        data?.resume_text ?? data?.resume ?? data?.resumeBody ?? data?.result?.resume ?? "";
      const cover =
        data?.cover_text ?? data?.cover_letter ?? data?.cover ?? data?.result?.cover_letter ?? "";

      const cleanedResume = stripContactSection(stripCodeFences(resume));
      const cleanedCover = stripContactSection(stripCodeFences(cover));

      setResumeText(cleanedResume);
      setCoverText(cleanedCover);

      if (!resume && !cover) {
        setError("No resume/cover fields found in response. Showing raw JSON below.");
        setResumeText(JSON.stringify(data, null, 2));
      }
    } catch (e) {
      setError(normalizeError(e));
    } finally {
      setLoading(false);
    }
  };

  /* -------------------- Save -------------------- */
  const saveToLibrary = async () => {
    const hasResume = !!resumeText?.trim();
    const hasCover = !!coverText?.trim();
    if (!hasResume && !hasCover) {
      alert("Nothing to save.");
      return;
    }

    try {
      let payload;
      if (hasResume && hasCover) {
        payload = {
          doc_type: "both",
          resume_title: "generated_resume",
          resume_text: resumeText,
          cover_title: "generated_cover_letter",
          cover_text: coverText,
        };
      } else if (hasResume) {
        payload = {
          doc_type: "resume",
          resume_title: "generated_resume",
          resume_text: resumeText,
        };
      } else {
        payload = {
          doc_type: "cover",
          cover_title: "generated_cover_letter",
          cover_text: coverText,
        };
      }

      const res = await postJSONAuth(`${API_BASE}/api/v1/resume-cover/save`, payload);
      alert(
        `✅ Saved!${
          res.resume_id ? ` Resume ID: ${res.resume_id}` : ""
        }${res.cover_id ? ` | Cover ID: ${res.cover_id}` : ""}`.trim()
      );
    } catch (e) {
      alert(`❌ Save failed: ${normalizeError(e)}`);
    }
  };

  /* -------------------- Downloads -------------------- */
  const downloadTXT = (name, text) => {
    if (!text) return;
    const blob = new Blob([stripContactSection(text)], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${name}.txt`);
  };

  const downloadDOCX = async (name, text) => {
    if (!text) return;
    const children = buildDocxChildrenFromText(text);
    const doc = new Document({ sections: [{ properties: {}, children }] });
    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${name}.docx`);
  };

  const downloadPDF = (name, text) => {
    if (!text) return;
    const clean = stripContactSection(text);
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;
    const lineHeight = 16;

    const wrapped = doc.splitTextToSize(String(clean), maxWidth);

    let y = margin;
    wrapped.forEach((line) => {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    });

    doc.save(`${name || "document"}.pdf`);
  };

  /* -------------------- UI -------------------- */
  const DocTypeChip = ({ value, label }) => (
    <button
      onClick={() => setDocType(value)}
      aria-pressed={docType === value}
      style={{
        ...styles.chip,
        ...(docType === value ? styles.chipActive : null),
      }}
    >
      {label}
    </button>
  );

  const hasOutput = Boolean(resumeText || coverText);

  return (
    <div style={styles.page}>
      {/* Global CSS helpers for responsive grid & motion */}
      <style>{`
        @keyframes pop-in { from { transform: translateY(6px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @media (max-width: 1024px) {
          .two-col { grid-template-columns: 1fr !important; }
          .sticky-col { position: static !important; top: auto !important; }
        }
        @media (min-width: 1025px) {
          .two-col { grid-template-columns: 0.9fr 2.1fr !important; }
          .left-col { max-width: 560px; }
          .jd-textarea { max-width: 560px; }
        }
        .fade-in { animation: pop-in .28s ease-out both; }
      `}</style>

      {/* Hero Header */}
      <div style={styles.hero}>
        <div style={styles.heroInner}>
          <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <span style={styles.badge}>AI-Assisted</span>
            <span style={styles.badgeSoft}>ATS-Friendly</span>
          </div>
          <h1 style={styles.heroTitle}>Resume & Cover Generator</h1>
          <p style={styles.heroSub}>
            Paste a job description, enter a quick command, and generate polished, ATS-ready docs in seconds.
          </p>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <DocTypeChip value="auto" label="Auto" />
            <DocTypeChip value="resume" label="Resume" />
            <DocTypeChip value="cover" label="Cover Letter" />
            <DocTypeChip value="both" label="Both" />
          </div>
        </div>
      </div>

      <div style={styles.container}>
        <div className="two-col" style={styles.layoutGrid}>
          {/* LEFT: JD */}
          <div className="sticky-col left-col" style={styles.leftCol}>
            <div style={styles.cardElevated} className="fade-in">
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>🧾 Job Description</h3>
                <span style={styles.metaPill}>{jdWords} words</span>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <textarea
                  className="jd-textarea"
                  rows={18}
                  placeholder="Paste Job Description here…"
                  value={jdText}
                  onChange={(e) => setJdText(e.target.value)}
                  style={styles.textarea}
                />
                <div style={styles.hintRow}>
                  <span>Tip: JD helps tailor achievements, keywords & tone—but it’s optional.</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Controls & Output */}
          <div style={styles.rightCol}>
            {/* Control Card */}
            <div style={styles.cardElevated} className="fade-in">
              <div style={styles.cardHeader}>
                <h3 style={styles.cardTitle}>⚙️ Controls</h3>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <label style={styles.switchLabel}>
                    <input
                      type="checkbox"
                      checked={useProfile}
                      onChange={(e) => setUseProfile(e.target.checked)}
                      style={styles.checkbox}
                    />
                    <span>Use my profile</span>
                  </label>
                  <a href="/profile" style={styles.link}>Edit Profile</a>
                </div>
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                <div style={styles.inputRow}>
                  <label style={styles.label}>Command</label>
                  <input
                    type="text"
                    placeholder={`e.g., "Generate a resume for mid-level Data Analyst in fintech"`}
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    style={styles.input}
                  />
                </div>

                {/* Contact overrides */}
                <details style={styles.details}>
                  <summary style={styles.summary}>Per-run contact overrides</summary>
                  <p style={styles.detailsText}>
                    These apply only to this generation (they won’t update your saved profile).
                  </p>
                  <div style={styles.grid2}>
                    {[
                      ["full_name", "Full name"],
                      ["email", "Email"],
                      ["phone", "Phone"],
                      ["location", "Location"],
                      ["linkedin", "LinkedIn URL"],
                      ["github", "GitHub URL"],
                      ["portfolio", "Portfolio URL"],
                    ].map(([k, label]) => (
                      <input
                        key={k}
                        placeholder={label}
                        value={overrides[k]}
                        onChange={(e) => setOverrides((o) => ({ ...o, [k]: e.target.value }))}
                        style={styles.input}
                      />
                    ))}
                  </div>
                </details>

                <div style={styles.actionBar}>
                  <button onClick={onGenerate} disabled={loading} style={{...styles.primaryBtn, ...(loading ? styles.btnDisabled : null)}}>
                    {loading ? "Generating…" : "Generate"}
                  </button>
                </div>

                {error && (
                  <div style={styles.error}>
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{safeText(error)}</pre>
                  </div>
                )}
              </div>
            </div>

            {/* Output */}
            {Boolean(resumeText || coverText) && (
              <div style={{ display: "grid", gap: 18 }}>
                {resumeText && (
                  <div style={styles.outputCard} className="fade-in">
                    <div style={styles.outputHeader}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={styles.outputEmoji}>📄</span>
                        <h3 style={styles.outputTitle}>Resume</h3>
                        <span style={styles.metaPillSoft}>
                          {resumeText.length.toLocaleString()} chars
                        </span>
                      </div>
                      <div style={styles.btnRow}>
                        <button style={styles.toolBtn} onClick={saveToLibrary}>💾 Save</button>
                        <button style={styles.toolBtn} onClick={() => downloadDOCX("generated_resume", resumeText)}>📃 DOCX</button>
                        <button style={styles.toolBtn} onClick={() => downloadTXT("generated_resume", resumeText)}>📝 TXT</button>
                        <button style={styles.toolBtn} onClick={() => downloadPDF("generated_resume", resumeText)}>📄 PDF</button>
                      </div>
                    </div>
                    <textarea value={resumeText} readOnly style={styles.outputArea} />
                  </div>
                )}

                {coverText && (
                  <div style={styles.outputCard} className="fade-in">
                    <div style={styles.outputHeader}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <span style={styles.outputEmoji}>💌</span>
                        <h3 style={styles.outputTitle}>Cover Letter</h3>
                        <span style={styles.metaPillSoft}>
                          {coverText.length.toLocaleString()} chars
                        </span>
                      </div>
                      <div style={styles.btnRow}>
                        <button style={styles.toolBtn} onClick={saveToLibrary}>💾 Save</button>
                        <button style={styles.toolBtn} onClick={() => downloadDOCX("generated_cover_letter", coverText)}>📃 DOCX</button>
                        <button style={styles.toolBtn} onClick={() => downloadTXT("generated_cover_letter", coverText)}>📝 TXT</button>
                        <button style={styles.toolBtn} onClick={() => downloadPDF("generated_cover_letter", coverText)}>📄 PDF</button>
                      </div>
                    </div>
                    <textarea value={coverText} readOnly style={styles.outputArea} />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Styles -------------------- */
const colors = {
  bg: "#f7fafc",
  heroFrom: "#eef2ff",
  heroTo: "#e6fffb",
  ink: "#0f172a",
  inkSoft: "#334155",
  border: "#e5e7eb",
  borderSoft: "#eef2f7",
  card: "#ffffff",
  hint: "#64748b",
  brand: "#0ea5e9",
  brandDark: "#0284c7",
  brandSoft: "#e0f2fe",
  successSoft: "#ecfeff",
};

const styles = {
  page: { minHeight: "100vh", background: colors.bg },

  hero: {
    background: `linear-gradient(120deg, ${colors.heroFrom}, ${colors.heroTo})`,
    borderBottom: `1px solid ${colors.border}`,
  },
  heroInner: {
    maxWidth: 1440,
    margin: "0 auto",
    padding: "28px 16px",
  },
  heroTitle: {
    margin: "8px 0 6px 0",
    fontSize: 28,
    lineHeight: 1.2,
    color: colors.ink,
    fontWeight: 800,
    letterSpacing: 0.2,
  },
  heroSub: {
    margin: "0 0 14px 0",
    color: colors.inkSoft,
    fontSize: 15,
  },
  badge: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: colors.brand,
    color: "#fff",
    fontWeight: 700,
    fontSize: 12,
  },
  badgeSoft: {
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    background: colors.brandSoft,
    color: colors.brandDark,
    fontWeight: 700,
    fontSize: 12,
  },
  chip: {
    padding: "8px 12px",
    borderRadius: 999,
    border: `1px solid ${colors.border}`,
    background: "#fff",
    cursor: "pointer",
    fontWeight: 600,
  },
  chipActive: {
    borderColor: colors.brand,
    background: colors.brandSoft,
    color: colors.brandDark,
  },

  container: { maxWidth: 1440, margin: "0 auto", padding: 16 },

  layoutGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 2fr",
    gap: 18,
    alignItems: "start",
  },

  leftCol: { position: "sticky", top: 16, alignSelf: "start" },
  rightCol: { display: "grid", gap: 18 },

  cardElevated: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
    padding: 16,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: 12,
  },
  cardTitle: { margin: 0, color: colors.ink },

  metaPill: {
    padding: "6px 10px",
    background: "#f1f5f9",
    borderRadius: 999,
    fontSize: 12,
    color: colors.inkSoft,
    border: `1px solid ${colors.border}`,
  },
  metaPillSoft: {
    padding: "4px 8px",
    background: "#f8fafc",
    borderRadius: 999,
    fontSize: 12,
    color: colors.inkSoft,
    border: `1px solid ${colors.border}`,
  },

  inputRow: {
    display: "grid",
    gridTemplateColumns: "160px 1fr",
    gap: 12,
    alignItems: "center",
  },
  label: { fontWeight: 700, color: colors.ink },

  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 12,
    border: `1px solid ${colors.border}`,
    background: "#fff",
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${colors.border}`,
    resize: "vertical",
    boxSizing: "border-box",
    minHeight: 520,
    background: "#fff",
  },

  hintRow: {
    display: "flex",
    justifyContent: "space-between",
    color: colors.hint,
    fontSize: 12,
  },

  switchLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: colors.inkSoft,
    cursor: "pointer",
  },
  checkbox: { width: 16, height: 16 },

  link: {
    textDecoration: "none",
    fontWeight: 700,
    color: colors.brandDark,
    borderBottom: `1px dashed ${colors.brandDark}`,
  },

  details: {
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
    padding: "10px 12px",
    background: "#fafafa",
  },
  summary: {
    cursor: "pointer",
    fontWeight: 700,
    color: colors.ink,
    listStyle: "none",
  },
  detailsText: { marginTop: 6, color: colors.hint, fontSize: 13 },

  grid2: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 12,
    marginTop: 10,
  },

  actionBar: {
    display: "flex",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 4,
  },

  primaryBtn: {
    padding: "12px 16px",
    background: colors.brand,
    color: "#fff",
    borderRadius: 12,
    border: `1px solid ${colors.brandDark}`,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(2,132,199,0.25)",
  },
  btnDisabled: {
    opacity: 0.7,
    cursor: "not-allowed",
  },

  error: {
    marginTop: 6,
    background: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: 12,
    padding: "10px 12px",
  },

  outputCard: {
    background: "#fff",
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
  },
  outputHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "12px 12px",
    borderBottom: `1px solid ${colors.border}`,
    background: colors.successSoft,
  },
  outputEmoji: { fontSize: 18 },
  outputTitle: { margin: 0, color: colors.ink },

  btnRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  toolBtn: {
    padding: "8px 10px",
    borderRadius: 10,
    background: "#fff",
    border: `1px solid ${colors.border}`,
    cursor: "pointer",
    fontWeight: 600,
  },

  outputArea: {
    width: "100%",
    minHeight: 420,
    border: "none",
    outline: "none",
    padding: 14,
    background: "#fff",
    whiteSpace: "pre-wrap",
    boxSizing: "border-box",
    borderRadius: "0 0 16px 16px",
  },
};
