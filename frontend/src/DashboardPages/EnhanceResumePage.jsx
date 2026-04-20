// src/DashboardPages/EnhanceResumePage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api, { API_BASE, setAuthToken } from "../lib/api";
import { jsPDF } from "jspdf";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph, HeadingLevel, TextRun } from "docx"; // ⬅️ keep

const ENHANCE_URL = `/api/v1/enhance/`;
const SAVE_RESUME_URL = `/api/v1/resume-cover/save`;

const safeText = (v) =>
  v == null
    ? ""
    : typeof v === "string" || typeof v === "number" || typeof v === "boolean"
    ? String(v)
    : JSON.stringify(v);

function normalizeError(errLike) {
  try {
    if (errLike?.code === "ECONNABORTED") return "Request timed out. Please try again.";
    const detail =
      errLike?.response?.data?.detail ??
      errLike?.response?.data ??
      errLike?.message ??
      errLike;
    if (Array.isArray(detail)) {
      return detail
        .map((d) => {
          const loc = Array.isArray(d.loc) ? d.loc.join(".") : d.loc;
          return `${loc}: ${d.msg || d.type || "error"}`;
        })
        .join(" | ");
    }
    if (detail && typeof detail === "object") {
      if (detail.msg) {
        const loc = Array.isArray(detail.loc) ? detail.loc.join(".") : detail.loc;
        return `${loc || "error"}: ${detail.msg}`;
      }
      return JSON.stringify(detail);
    }
    return String(detail);
  } catch {
    return "Unexpected error";
  }
}

async function fetchFontAsBase64(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load font: ${path}`);
  const ab = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(ab);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const EnhanceResumePage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    resumeName: stateName,
    resumeText: stateText,
    missingKeywords: stateMissing = [],
    jdText: jdFromMatcher = "",
  } = location.state || {};

  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const qpName = query.get("resumeName") || "";
  const qpMissing = (query.get("missing") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const resumeName = stateName || qpName || "resume";
  const missingKeywords =
    Array.isArray(stateMissing) && stateMissing.length ? stateMissing : qpMissing;

  const [resumeText] = useState(stateText || "");
  const [jdText, setJdText] = useState(jdFromMatcher || "");

  const [enhancedResume, setEnhancedResume] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [rewriteExperience, setRewriteExperience] = useState(true);
  const [rewriteStrength, setRewriteStrength] = useState(0.7);

  // responsive (no global style mutation)
  const [isNarrow, setIsNarrow] = useState(
    typeof window !== "undefined" ? window.innerWidth < 1000 : false
  );
  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < 1000);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const t = localStorage.getItem("token") || localStorage.getItem("access_token");
    const type = localStorage.getItem("token_type") || "Bearer";
    if (!t) {
      setError("You’re not logged in. Please sign in to save.");
    } else {
      setAuthToken(t, type);
    }
  }, []);

  const enhanceCtrlRef = useRef(null);
  useEffect(() => {
    enhanceResume(false);
    return () => {
      try {
        enhanceCtrlRef.current?.abort();
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enhanceResume = async (isRerun = true) => {
    if (!resumeText?.trim()) {
      setError(
        "Original resume text is missing. Go back to Resume Matcher and click “Enhance My Resume”."
      );
      return;
    }
    try {
      enhanceCtrlRef.current?.abort();
    } catch {}
    const ctrl = new AbortController();
    enhanceCtrlRef.current = ctrl;

    setLoading(true);
    if (!isRerun) setEnhancedResume("");
    setError("");

    try {
      const payload = {
        resume_text: resumeText,
        jd_text: jdText || null,
        missing_keywords: missingKeywords || [],
        strategy: isRerun && !rewriteExperience ? "keywords_only" : "rewrite_experience",
        options: { rewrite_strength: rewriteStrength },
      };

      const { data } = await api.post(ENHANCE_URL, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 90000,
        signal: ctrl.signal,
        validateStatus: () => true,
      });

      if (data?.detail) {
        setError(`❌ ${normalizeError({ response: { data } })}`);
        setEnhancedResume("");
        return;
      }

      const text =
        data?.rewritten_resume ||
        data?.enhanced_resume ||
        data?.improved_resume ||
        data?.text ||
        "";

      if (!text) setError("No content returned by the enhancement service.");
      setEnhancedResume(safeText(text));
    } catch (err) {
      if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
        setError(`❌ ${normalizeError(err)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const saveToLibrary = async () => {
    if (!enhancedResume?.trim()) {
      alert("Nothing to save yet. Please enhance first.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        doc_type: "resume",
        resume_title: `${resumeName}_enhanced`,
        resume_text: enhancedResume,
        resume_source: "enhancer",
      };
      const { data, status } = await api.post(SAVE_RESUME_URL, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
        validateStatus: () => true,
      });
      if (status >= 400 || data?.detail) throw { response: { data, status } };
      alert("✅ Saved to My Resumes!");
      navigate("/my-resumes");
    } catch (err) {
      alert(`❌ ${normalizeError(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const downloadPDF = async () => {
    if (!enhancedResume) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const regularB64 = await fetchFontAsBase64("/fonts/NotoSans-VariableFont_wdth,wght.ttf");
    doc.addFileToVFS("NotoSans-Regular.ttf", regularB64);
    doc.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
    try {
      const italicB64 = await fetchFontAsBase64("/fonts/NotoSans-Italic-VariableFont_wdth,wght.ttf");
      doc.addFileToVFS("NotoSans-Italic.ttf", italicB64);
      doc.addFont("NotoSans-Italic.ttf", "NotoSans", "italic");
    } catch {}
    doc.setFont("NotoSans", "normal");
    doc.setFontSize(11);

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const lineHeight = 16;
    const maxLineWidth = pageWidth - margin * 2;

    const lines = doc.splitTextToSize(String(enhancedResume), maxLineWidth);
    let cursorY = margin;
    for (const line of lines) {
      if (cursorY + lineHeight > pageHeight - margin) {
        doc.addPage();
        doc.setFont("NotoSans", "normal");
        doc.setFontSize(11);
        cursorY = margin;
      }
      doc.text(line, margin, cursorY, { baseline: "top" });
      cursorY += lineHeight;
    }
    doc.save(`${resumeName}_enhanced.pdf`);
  };

  const downloadTXT = () => {
    if (!enhancedResume) return;
    const blob = new Blob([String(enhancedResume)], { type: "text/plain;charset=utf-8" });
    saveAs(blob, `${resumeName}_enhanced.txt`);
  };

  // DOCX builder
  const downloadDOCX = async () => {
    if (!enhancedResume) return;

    const sectionHeadings = new Set([
      "summary",
      "technical skills",
      "skills",
      "projects",
      "professional experience",
      "experience",
      "education",
      "certifications",
    ]);

    const lines = String(enhancedResume).replace(/\r\n/g, "\n").split("\n");
    const children = [];

    // Centered contact line if detected
    if (lines.length > 0 && /@|linkedin|github|portfolio|phone|www|http/i.test(lines[0])) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: lines[0].trim(), bold: true })],
          spacing: { after: 200 },
          alignment: "center",
        })
      );
      lines.shift();
    }

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();

      if (!line) {
        children.push(new Paragraph({ spacing: { after: 200 } }));
        continue;
      }

      const lc = line.toLowerCase().replace(/:$/, "");
      if (sectionHeadings.has(lc)) {
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
        const text = line.replace(/^([•\-*])\s+/, "");
        children.push(
          new Paragraph({
            text,
            bullet: { level: 0 },
            spacing: { after: 80 },
          })
        );
        continue;
      }

      if (/^[A-Za-z][A-Za-z\s]+:\s/.test(line)) {
        const [label, ...rest] = line.split(":");
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${label}:`, bold: true }),
              new TextRun({ text: ` ${rest.join(":").trim()}` }),
            ],
            spacing: { after: 120 },
          })
        );
        continue;
      }

      children.push(
        new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 120 },
        })
      );
    }

    const doc = new Document({
      sections: [{ properties: {}, children }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `${resumeName}_enhanced.docx`);
  };

  const copyOutput = async () => {
    if (!enhancedResume) return;
    try {
      await navigator.clipboard.writeText(String(enhancedResume));
      alert("Copied enhanced resume to clipboard.");
    } catch {
      alert("Copy failed. Select and copy manually.");
    }
  };

  const clearJD = () => setJdText("");

  const outputCharCount = enhancedResume?.length || 0;
  const jdCharCount = jdText?.length || 0;

  return (
    <div style={sx.page}>
      <div style={sx.container}>
        {/* Sticky toolbar */}
        <div style={sx.toolbar}>
          <div style={sx.toolbarLeft}>
            <div style={sx.breadcrumb}>Tools / <strong>Enhance Resume</strong></div>
            <h2 style={sx.title}>
              ✨ Resume Enhancement
              <span style={sx.badge}>{loading ? "Running…" : enhancedResume ? "Ready" : "Idle"}</span>
            </h2>
          </div>
          <div style={sx.toolbarRight}>
            <div style={sx.fileName}>
              File:&nbsp;<span style={{ color: "#2563eb" }}>{safeText(resumeName) || "N/A"}</span>
            </div>
            <div style={sx.toolbarBtns}>
              <button
                onClick={() => enhanceResume(true)}
                style={sx.btnDark}
                disabled={loading}
                title="Re-run Enhancement"
              >
                {loading ? "Re-running…" : "🔄 Re-run"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div style={sx.errorBox}>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{safeText(error)}</pre>
            {!resumeText && (
              <div style={{ marginTop: 8 }}>
                <button style={sx.btnSecondary} onClick={() => navigate("/resume-matcher")}>
                  ← Go back to Resume Matcher
                </button>
              </div>
            )}
          </div>
        )}

        {/* Missing keyword chips */}
        {missingKeywords?.length > 0 && (
          <div style={sx.keywordRow}>
            <div style={sx.keywordLabel}>Missing keywords from JD:</div>
            <div style={sx.keywordWrap}>
              {missingKeywords.map((k, i) => (
                <span key={i} style={sx.chip}>
                  {k}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Grid */}
        <div
          style={{
            ...sx.grid,
            gridTemplateColumns: isNarrow ? "1fr" : "30% 70%",
          }}
        >
          {/* LEFT: JD + controls */}
          <div style={sx.card}>
            <div style={sx.cardHeader}>
              <div>
                <div style={sx.cardTitle}>Job Description Context</div>
                <div style={sx.cardSub}>Optional — helps tailor Summary & Experience bullets.</div>
              </div>
              <div style={sx.smallActions}>
                <button onClick={clearJD} style={sx.btnTinyGhost} title="Clear JD">
                  Clear
                </button>
              </div>
            </div>

            {/* CLEAN OPTIONS BOX */}
            <div style={sx.optionsBox}>
              {/* Toggle */}
              <div style={sx.optionRow}>
                <label style={sx.switchLabel}>
                  <input
                    type="checkbox"
                    checked={rewriteExperience}
                    onChange={(e) => setRewriteExperience(e.target.checked)}
                    style={{ marginRight: 10 }}
                  />
                  <div>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>Rewrite Experience</div>
                    <div style={sx.helpText}>Inject JD keywords into your experience bullets.</div>
                  </div>
                </label>
              </div>

              {/* Slider */}
              <div style={sx.optionRowCol}>
                <label htmlFor="strength" style={sx.sliderLabelRow}>
                  <span>Rewrite strength</span>
                  <span style={sx.sliderValuePill}>{Math.round(rewriteStrength * 100)}%</span>
                </label>
                <input
                  id="strength"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={Math.round(rewriteStrength * 100)}
                  onChange={(e) => setRewriteStrength(Number(e.target.value) / 100)}
                  style={sx.sliderFull}
                />
                <div style={sx.tickRow}>
                  <span>Soft</span>
                  <span>Balanced</span>
                  <span>Strong</span>
                </div>
              </div>
            </div>

            {/* JD textarea */}
            <div style={{ position: "relative", marginTop: 12 }}>
              <label htmlFor="jdctx" style={sx.textareaLabel}>
                Paste Job Description
              </label>
              <textarea
                id="jdctx"
                placeholder="Paste the JD here…"
                rows={isNarrow ? 14 : 20}
                style={sx.textarea}
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
              />
              <div style={sx.counter}>{jdCharCount.toLocaleString()} chars</div>
            </div>

            <button
              onClick={() => enhanceResume(true)}
              style={sx.btnPrimaryWide}
              disabled={loading}
              type="button"
              title="Run enhancement with the current settings"
            >
              {loading ? "⏳ Enhancing…" : "🚀 Enhance with these settings"}
            </button>
          </div>

          {/* RIGHT: Output */}
          <div style={{ ...sx.card, paddingBottom: 0, display: "flex", flexDirection: "column" }}>
            <div style={sx.cardHeader}>
              <div>
                <div style={sx.cardTitle}>Enhanced Resume</div>
                <div style={sx.cardSub}>
                  Read-only preview. Use the buttons below to copy or download.
                </div>
              </div>
              <div style={sx.smallActions}>
                <button onClick={copyOutput} style={sx.btnTinyGhost} disabled={!enhancedResume}>
                  Copy
                </button>
              </div>
            </div>

            <div style={{ position: "relative", flex: 1, minHeight: isNarrow ? 280 : 480 }}>
              {loading ? (
                <div style={sx.loadingBox}>⏳ Enhancing your resume…</div>
              ) : (
                <textarea
                  readOnly
                  rows={isNarrow ? 16 : 24}
                  style={{ ...sx.textarea, height: "100%", resize: "none" }}
                  value={safeText(enhancedResume)}
                  placeholder={error ? "No enhanced resume to show." : "Enhanced resume will appear here."}
                />
              )}
              <div style={sx.counter}>{outputCharCount.toLocaleString()} chars</div>
            </div>

            <div style={sx.footerBar}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => navigate(-1)} style={sx.btnGhost} aria-label="Go back">
                  ← Back
                </button>
                <button
                  onClick={saveToLibrary}
                  style={sx.btnGreen}
                  disabled={!enhancedResume || saving}
                  aria-label="Save enhanced resume to library"
                >
                  {saving ? "Saving…" : "💾 Save to My Resumes"}
                </button>
              </div>
              <div style={sx.downloadGroup}>
                <button onClick={downloadPDF} style={sx.btnBlue} disabled={!enhancedResume}>
                  📄 PDF
                </button>
                <button onClick={downloadDOCX} style={sx.btnBlue} disabled={!enhancedResume}>
                  📃 DOCX
                </button>
                <button onClick={downloadTXT} style={sx.btnBlue} disabled={!enhancedResume}>
                  📝 TXT
                </button>
              </div>
            </div>
          </div>
        </div>
        {/* /Grid */}
      </div>
    </div>
  );
};

/* -------------------- Styles -------------------- */
const sx = {
  page: {
    minHeight: "100vh",
    padding: "28px 18px",
    display: "flex",
    justifyContent: "center",
    background:
      "linear-gradient(180deg, rgba(241,248,255,1) 0%, rgba(247,250,255,1) 60%, rgba(255,255,255,1) 100%)",
  },
  container: { width: "min(1380px, 100%)" },

  toolbar: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    backdropFilter: "saturate(140%) blur(6px)",
    background: "rgba(255,255,255,0.75)",
    border: "1px solid #eef2f7",
    boxShadow: "0 6px 20px rgba(15,23,42,.06)",
    borderRadius: 14,
    padding: "14px 16px",
    marginBottom: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toolbarLeft: { display: "flex", flexDirection: "column", gap: 4 },
  breadcrumb: { color: "#64748b", fontSize: ".85rem" },
  title: { margin: 0, fontSize: "1.65rem", color: "#0f172a", letterSpacing: ".2px", display: "flex", gap: 10, alignItems: "center" },
  badge: {
    display: "inline-block",
    background: "#eef2ff",
    color: "#3730a3",
    border: "1px solid #c7d2fe",
    padding: "2px 8px",
    fontSize: ".8rem",
    borderRadius: 999,
    marginLeft: 8,
  },
  toolbarRight: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  fileName: { color: "#334155", fontSize: ".95rem" },
  toolbarBtns: { display: "flex", gap: 8, flexWrap: "wrap" },

  errorBox: {
    marginTop: 14,
    marginBottom: 12,
    background: "#fef2f2",
    color: "#b91c1c",
    border: "1px solid #fecaca",
    borderRadius: 12,
    padding: "10px 12px",
  },

  keywordRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    margin: "8px 0 12px",
    flexWrap: "wrap",
  },
  keywordLabel: { color: "#0f172a", fontWeight: 600, paddingTop: 2 },
  keywordWrap: { display: "flex", gap: 8, flexWrap: "wrap" },
  chip: {
    padding: "4px 10px",
    borderRadius: 999,
    background: "#f1f5f9",
    border: "1px solid #e2e8f0",
    color: "#0f172a",
    fontSize: ".85rem",
  },

  grid: {
    display: "grid",
    gap: 20,
    alignItems: "stretch",
  },

  card: {
    background: "#ffffff",
    borderRadius: 14,
    border: "1px solid #eef2f7",
    boxShadow: "0 10px 30px rgba(15,23,42,.06)",
    padding: 18,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  cardTitle: { fontWeight: 700, color: "#0f172a", fontSize: "1.1rem" },
  cardSub: { color: "#64748b", fontSize: ".92rem" },
  smallActions: { display: "flex", gap: 6 },

  /* --- New tidy options styling --- */
  optionsBox: {
    border: "1px solid #e6eef7",
    background: "#f8fbff",
    borderRadius: 12,
    padding: "12px 12px",
    display: "grid",
    gap: 12,
  },
  optionRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  optionRowCol: {
    display: "grid",
    gap: 8,
  },
  helpText: { color: "#64748b", fontSize: ".9rem", marginTop: 2 },
  switchLabel: { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" },

  sliderLabelRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontWeight: 700,
    color: "#0f172a",
  },
  sliderValuePill: {
    padding: "2px 8px",
    borderRadius: 999,
    background: "#eef2ff",
    border: "1px solid #c7d2fe",
    color: "#3730a3",
    fontSize: ".85rem",
    fontWeight: 700,
  },
  sliderFull: { width: "100%", accentColor: "#2563eb" },
  tickRow: {
    display: "flex",
    justifyContent: "space-between",
    color: "#94a3b8",
    fontSize: ".8rem",
  },

  textareaLabel: {
    display: "block",
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: 6,
  },

  textarea: {
    width: "100%",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: "#fbfdff",
    padding: "12px 14px",
    fontSize: "0.98rem",
    lineHeight: 1.55,
    resize: "vertical",
    minHeight: 200,
    outline: "none",
    boxShadow: "inset 0 1px 0 rgba(0,0,0,.02)",
  },
  counter: {
    position: "absolute",
    right: 10,
    bottom: 10,
    fontSize: ".78rem",
    color: "#64748b",
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: 999,
    padding: "2px 8px",
  },

  loadingBox: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px dashed #cbd5e1",
    borderRadius: 12,
    background: "#f8fafc",
    color: "#475569",
    height: "100%",
  },

  footerBar: {
    marginTop: "auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: "12px 14px",
    borderTop: "1px solid #eef2f7",
    background: "#f8fafc",
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    flexWrap: "wrap",
  },
  downloadGroup: { display: "flex", gap: 8, flexWrap: "wrap" },

  // Buttons
  btnDark: {
    padding: "10px 12px",
    background: "#0f172a",
    color: "#fff",
    border: "1px solid #0f172a",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
  },
  btnGreen: {
    padding: "10px 12px",
    background: "#10b981",
    color: "#fff",
    border: "1px solid #059669",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
  },
  btnBlue: {
    padding: "10px 12px",
    background: "#2563eb",
    color: "#fff",
    border: "1px solid #1d4ed8",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 600,
  },
  btnPrimaryWide: {
    width: "100%",
    marginTop: 12,
    padding: "12px 14px",
    borderRadius: 10,
    background: "linear-gradient(90deg,#0ea5e9,#2563eb)",
    color: "#fff",
    border: "1px solid #1d4ed8",
    fontWeight: 800,
    cursor: "pointer",
    letterSpacing: ".2px",
  },
  btnGhost: {
    padding: "10px 12px",
    background: "transparent",
    border: "1px solid #cbd5e1",
    color: "#0f172a",
    borderRadius: 10,
    cursor: "pointer",
  },
  btnSecondary: {
    padding: "8px 12px",
    background: "#eef2ff",
    border: "1px solid #c7d2fe",
    color: "#1e3a8a",
    borderRadius: 10,
    cursor: "pointer",
  },
  btnTinyGhost: {
    padding: "6px 10px",
    background: "transparent",
    border: "1px solid #e2e8f0",
    color: "#334155",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: ".85rem",
  },
};

export default EnhanceResumePage;
