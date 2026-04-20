// src/pages/ResumeMatcherPage.js
import React, { useState } from "react";
import {
  FaFilePdf,
  FaFileWord,
  FaFileAlt,
  FaTimes,
  FaUpload,
  FaBolt,
  FaBroom,
  FaCheckCircle,
  FaExclamationCircle,
} from "react-icons/fa";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
const COMPARE_URL = `${API_BASE}/api/v1/compare/`;
const PARSE_URL = `${API_BASE}/api/v1/parse/`;

const ResumeMatcherPage = () => {
  const [resumes, setResumes] = useState([]); // [{file}]
  const [jobDescriptionFile, setJobDescriptionFile] = useState(null);
  const [jobDescriptionText, setJobDescriptionText] = useState("");
  const [comparisonResult, setComparisonResult] = useState(null);
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [comparisonType, setComparisonType] = useState("overall"); // default to overall
  const navigate = useNavigate();

  // kept off
  const [showInsights, setShowInsights] = useState(false);
  const [parsed, setParsed] = useState(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState(null);

  /* -------------------- helpers -------------------- */
  const safeErr = async (res) => {
    try {
      const t = await res.text();
      try {
        const j = JSON.parse(t);
        return j?.detail || t || res.statusText;
      } catch {
        return t || res.statusText;
      }
    } catch {
      return res.statusText;
    }
  };

  const parseSelectedResume = async (file) => {
    const form = new FormData();
    form.append("resume_file", file);
    form.append("fuzzy_skills", "true");
    const res = await fetch(PARSE_URL, { method: "POST", body: form });
    if (!res.ok) throw new Error(await safeErr(res));
    return res.json();
  };

  /* -------------------- uploads -------------------- */
  const addResumes = async (filesArr) => {
    if (!filesArr?.length) return;
    if (filesArr.length + resumes.length > 3) {
      alert("⚠️ You can upload up to 3 resumes.");
      return;
    }
    const filesWithMeta = filesArr.map((file) => ({ file }));
    const next = [...resumes, ...filesWithMeta];
    setResumes(next);

    if (showInsights) {
      const firstFile = next[0]?.file;
      if (firstFile) {
        try {
          setParseLoading(true);
          setParseError(null);
          const data = await parseSelectedResume(firstFile);
          setParsed(data);
        } catch (err) {
          setParsed(null);
          setParseError(err.message || "Could not parse this resume.");
        } finally {
          setParseLoading(false);
        }
      } else {
        setParsed(null);
        setParseError(null);
      }
    }
  };

  const handleResumeUpload = (e) => addResumes(Array.from(e.target.files || []));
  const prevent = (e) => e.preventDefault();
  const handleDropResumes = (e) => {
    e.preventDefault();
    addResumes(Array.from(e.dataTransfer?.files || []));
  };

  const removeResume = async (indexToRemove) => {
    const next = resumes.filter((_, i) => i !== indexToRemove);
    setResumes(next);
    if (showInsights) {
      const firstFile = next[0]?.file;
      if (!firstFile) {
        setParsed(null);
        setParseError(null);
      } else {
        try {
          setParseLoading(true);
          setParseError(null);
          const data = await parseSelectedResume(firstFile);
          setParsed(data);
        } catch (err) {
          setParsed(null);
          setParseError(err.message || "Could not parse this resume.");
        } finally {
          setParseLoading(false);
        }
      }
    }
  };

  const handleJobDescriptionUpload = (e) => {
    const file = (e.target.files || [])[0];
    setJobDescriptionFile(file || null);
    setJobDescriptionText("");
  };

  const handleDropJD = (e) => {
    e.preventDefault();
    const file = (e.dataTransfer?.files || [])[0];
    if (file) {
      setJobDescriptionFile(file);
      setJobDescriptionText("");
    }
  };

  const removeJobDescriptionFile = () => setJobDescriptionFile(null);

  const handleJobDescriptionText = (e) => {
    setJobDescriptionText(e.target.value);
    setJobDescriptionFile(null);
  };

  const handleClear = () => {
    setResumes([]);
    setJobDescriptionFile(null);
    setJobDescriptionText("");
    setComparisonResult(null);
    setJdText("");
    setParsed(null);
    setParseError(null);
  };

  /* -------------------- compare -------------------- */
  const handleCompare = async () => {
    if (resumes.length === 0) {
      alert("Please upload at least one resume.");
      return;
    }
    if (!jobDescriptionFile && !jobDescriptionText.trim()) {
      alert("Please upload or paste a job description.");
      return;
    }

    setLoading(true);
    setComparisonResult(null);

    const formData = new FormData();
    resumes.forEach(({ file }) => formData.append("resumes", file));
    if (jobDescriptionFile) formData.append("jd_file", jobDescriptionFile);
    else formData.append("jd_text", jobDescriptionText);

    formData.append("comparison_type", comparisonType);
    formData.append("top_n_keywords", "40");
    formData.append("return_text", "true");
    formData.append("max_pdf_pages", "60");

    try {
      const response = await axios.post(COMPARE_URL, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (response.data?.results) {
        setComparisonResult(response.data.results);
        setJdText(response.data.jd_text || "");
      } else {
        console.warn("Unexpected response shape:", response.data);
        alert("❌ Invalid response from backend.");
      }
    } catch (error) {
      console.error("❌ Error comparing:", error);
      const msg =
        error?.response?.data?.detail ||
        error?.response?.data?.message ||
        error?.message ||
        "Comparison failed. Please check backend logs.";
      alert(`❌ ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  /* -------------------- misc -------------------- */
  const getFileIcon = (fileName = "") => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "pdf") return <FaFilePdf color="#e11d48" style={styles.fileIcon} title="PDF file" />;
    if (ext === "docx")
      return <FaFileWord color="#1d4ed8" style={styles.fileIcon} title="Word document" />;
    if (ext === "txt") return <FaFileAlt color="#059669" style={styles.fileIcon} title="Text file" />;
    return <FaFileAlt style={styles.fileIcon} title="File" />;
  };

  const goToEnhance = (resumeName, missingKeywords, resumeText) => {
    navigate("/enhance-resume", {
      state: { resumeName, missingKeywords, resumeText, jdText },
    });
  };

  /* -------------------- UI -------------------- */
  const Chip = ({ value, label }) => (
    <button
      onClick={() => setComparisonType(value)}
      aria-pressed={comparisonType === value}
      type="button"
      style={{
        ...styles.chip,
        ...(comparisonType === value ? styles.chipActive : null),
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        {/* LEFT: Sidebar */}
        <aside className="sticky-col" style={styles.sidebar}>
          <h2 style={styles.sideHeader}>📂 Uploads</h2>

          {/* Resumes */}
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Resumes (max 3)</h3>
              <label htmlFor="resume-upload" style={styles.link}>
                <FaUpload />&nbsp;Browse
              </label>
              <input
                id="resume-upload"
                type="file"
                accept=".pdf,.docx,.txt"
                multiple
                onChange={handleResumeUpload}
                style={{ display: "none" }}
              />
            </div>

            {/* Drag & drop zone */}
            <div
              onDragOver={prevent}
              onDragEnter={prevent}
              onDrop={handleDropResumes}
              style={styles.dropzone}
            >
              <FaUpload />
              <span>Drag & drop resumes here</span>
              <small>PDF / DOCX / TXT</small>
            </div>

            <div style={styles.filePreview}>
              {resumes.map(({ file }, idx) => (
                <div key={idx} style={styles.fileItem}>
                  {getFileIcon(file?.name)}
                  <span title={file?.name} style={styles.fileName}>
                    {file?.name}
                  </span>
                  <button
                    style={styles.xBtn}
                    onClick={() => removeResume(idx)}
                    type="button"
                    aria-label="Remove file"
                  >
                    <FaTimes />
                  </button>
                </div>
              ))}
              {resumes.length === 0 && <div style={styles.emptyHint}>No resumes uploaded yet.</div>}
            </div>
          </section>

          {/* JD file */}
          <section style={styles.card}>
            <div style={styles.cardHeader}>
              <h3 style={styles.cardTitle}>Job Description</h3>
              <label htmlFor="jd-upload" style={styles.link}>
                <FaUpload />&nbsp;Upload
              </label>
              <input
                id="jd-upload"
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleJobDescriptionUpload}
                style={{ display: "none" }}
              />
            </div>

            <div
              onDragOver={prevent}
              onDragEnter={prevent}
              onDrop={handleDropJD}
              style={{ ...styles.dropzone, minHeight: 88 }}
            >
              <FaUpload />
              <span>Drag & drop JD here</span>
              <small>PDF / DOCX / TXT</small>
            </div>

            {jobDescriptionFile && (
              <div style={styles.fileItem}>
                {getFileIcon(jobDescriptionFile.name)}
                <span title={jobDescriptionFile.name} style={styles.fileName}>
                  {jobDescriptionFile.name}
                </span>
                <button
                  style={styles.xBtn}
                  onClick={removeJobDescriptionFile}
                  type="button"
                  aria-label="Remove JD file"
                >
                  <FaTimes />
                </button>
              </div>
            )}
          </section>

          {/* JD textarea */}
          <section style={styles.card}>
            <label htmlFor="jd-text" style={styles.label}>
              Or paste JD
            </label>
            <textarea
              id="jd-text"
              placeholder="Paste job description…"
              rows={6}
              style={styles.textarea}
              value={jobDescriptionText}
              onChange={handleJobDescriptionText}
            />
          </section>

          {/* Comparison Type */}
          <section style={styles.card}>
            <label style={styles.label}>Comparison Type</label>
            <div style={styles.chipsRow}>
              <Chip value="word" label="Word-to-Word" />
              <Chip value="skill" label="Skill Match" />
              <Chip value="overall" label="Overall Match" />
            </div>
          </section>

          {/* Actions */}
          <div style={styles.actions}>
            <button style={styles.clearBtn} onClick={handleClear} type="button">
              <FaBroom />&nbsp;Clear
            </button>
            <button
              style={{ ...styles.compareBtn, ...(loading ? styles.btnDisabled : null) }}
              onClick={handleCompare}
              disabled={loading}
              type="button"
            >
              {loading ? "Comparing…" : "🔍 Compare"}
            </button>
          </div>
        </aside>

        {/* RIGHT: Content */}
        <main style={styles.content}>
          <div style={styles.rightHeader}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={styles.badge}><FaBolt style={{ marginRight: 6 }} /> AI-assisted</span>
              <span style={styles.badgeSoft}>ATS-aware matching</span>
            </div>
          </div>

          <h1 style={styles.heroTitle}>Resume ⇄ JD Matcher</h1>
          <p style={styles.heroSub}>
            Compare your resumes with the job description and see matched & missing keywords instantly.
          </p>

          <section style={styles.resultShell}>
            <div style={styles.resultHeader}>
              <h3 style={styles.resultTitle}>🧠 Comparison Output</h3>
              {!!jdText?.trim() && (
                <span title="Using the processed JD from backend" style={styles.metaPill}>
                  JD Loaded
                </span>
              )}
            </div>

            {loading && <p style={{ color: "#475569" }}>⏳ Comparing resumes with the job description…</p>}

            {!loading && !comparisonResult && (
              <p style={{ color: "#64748b" }}>
                Upload resumes and a job description on the left, then click <b>Compare</b>.
              </p>
            )}

            {!loading && comparisonResult?.length === 0 && <p>No resumes to compare.</p>}

            {!loading && comparisonResult?.length > 0 && (
              <div style={styles.resultsGrid}>
                {comparisonResult.map((result, idx) => (
                  <ResultCard
                    key={idx}
                    result={result}
                    onEnhance={() =>
                      goToEnhance(
                        result.fileName,
                        result.unmatched_keywords || [],
                        result.resume_text
                      )
                    }
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
};

/* ------------ Subcomponents ------------ */
function ResultCard({ result, onEnhance }) {
  const pct = Number(result?.match_percentage ?? 0);
  const matched = result?.matched_keywords || [];
  const missing = result?.unmatched_keywords || [];

  const good = pct >= 70;
  const statusIcon = good ? (
    <FaCheckCircle color="#16a34a" />
  ) : (
    <FaExclamationCircle color="#e11d48" />
  );

  return (
    <div style={styles.resultCard}>
      <div style={styles.resultCardHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, maxWidth: "100%" }}>
          {statusIcon}
          <h4 style={{ margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {result?.fileName || "Resume"}
          </h4>
        </div>
        <span style={styles.pct}>{pct}%</span>
      </div>

      <ProgressBar value={pct} />

      <div style={styles.kvRow}>
        <div style={styles.kv}>
          <div style={styles.kvLabel}>Matched</div>
          <div style={styles.tagsWrap}>
            {matched.length ? (
              matched.map((w, i) => (
                <span key={i} style={styles.matchTag}>{w}</span>
              ))
            ) : (
              <span style={styles.emptyTag}>None</span>
            )}
          </div>
        </div>

        <div style={styles.kv}>
          <div style={styles.kvLabel}>Missing</div>
          <div style={styles.tagsWrap}>
            {missing.length ? (
              missing.map((w, i) => (
                <span key={i} style={styles.missTag}>{w}</span>
              ))
            ) : (
              <span style={styles.emptyTag}>None</span>
            )}
          </div>
        </div>
      </div>

      <div style={styles.cardActions}>
        <button style={styles.enhanceBtn} onClick={onEnhance} type="button">
          🚀 Enhance My Resume
        </button>
      </div>
    </div>
  );
}

function ProgressBar({ value = 0 }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div style={styles.progressOuter} aria-label="Match percentage">
      <div style={{ ...styles.progressInner, width: `${pct}%` }} />
    </div>
  );
}

function ParsedInsights() {
  return null;
}

/* ------------ Styles ------------ */
const colors = {
  bg: "#f7fafc",
  ink: "#0f172a",
  inkSoft: "#334155",
  border: "#e5e7eb",
  card: "#ffffff",
  brand: "#0ea5e9",
  brandDark: "#0284c7",
  brandSoft: "#e0f2fe",
  accent: "#22c55e",
  danger: "#e11d48",
  goodSoft: "#ecfdf5",
  missSoft: "#fff1f2",
};

const styles = {
  page: { minHeight: "100vh", background: colors.bg },

  shell: {
    maxWidth: 1440,
    margin: "0 auto",
    padding: 16,
    display: "grid",
    gridTemplateColumns: "360px 1fr",
    gap: 16,
  },

  sidebar: {
    alignSelf: "start",
    position: "sticky",
    top: 12,
    display: "grid",
    gap: 16,
    background: "#e0f2fe",
    borderRight: "1px solid #d6dee8",
    padding: 24,
    boxShadow: "2px 0 8px rgba(0,0,0,0.05)",
    borderRadius: 12,
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
  },
  sideHeader: { margin: 0, color: colors.ink, fontSize: 18 },

  card: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
    padding: 14,
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottom: `1px solid ${colors.border}`,
    marginBottom: 10,
    minWidth: 0,
    maxWidth: "100%",
  },
  cardTitle: { margin: 0, color: colors.ink, fontSize: 16 },
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: colors.brandDark,
    borderBottom: `1px dashed ${colors.brandDark}`,
    textDecoration: "none",
    fontWeight: 700,
    cursor: "pointer",
    flexShrink: 0,
  },

  dropzone: {
    border: `1.5px dashed ${colors.border}`,
    borderRadius: 12,
    padding: 18,
    display: "grid",
    placeItems: "center",
    gap: 6,
    color: "#64748b",
    background: "#fafafa",
    textAlign: "center",
    minWidth: 0,
  },

  filePreview: {
    marginTop: 10,
    display: "grid",
    gap: 8,
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
  },

  fileItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#f1f5f9",
    padding: "8px 12px",
    borderRadius: 10,
    fontSize: "0.92rem",
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
  },
  fileIcon: { fontSize: "1.15rem", flexShrink: 0 },
  fileName: {
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    wordBreak: "break-all",
    display: "block",
  },
  xBtn: {
    marginLeft: "auto",
    background: "transparent",
    border: "1px solid #cbd5e1",
    color: colors.danger,
    cursor: "pointer",
    padding: "4px 8px",
    borderRadius: 8,
    flexShrink: 0,
  },
  emptyHint: { color: "#94a3b8", fontStyle: "italic", fontSize: 13 },

  label: { display: "block", marginBottom: 8, fontWeight: 700, color: colors.ink },
  textarea: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: `1px solid ${colors.border}`,
    resize: "vertical",
    fontSize: "0.95rem",
    minHeight: 120,
  },

  chipsRow: { display: "flex", gap: 8, flexWrap: "wrap" },
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

  actions: { display: "flex", gap: 10, marginTop: 6 },
  compareBtn: {
    flex: 1,
    padding: "12px 14px",
    background: colors.brand,
    color: "#fff",
    border: `1px solid ${colors.brandDark}`,
    borderRadius: 12,
    fontWeight: 800,
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(2,132,199,0.25)",
  },
  clearBtn: {
    flex: 1,
    padding: "12px 14px",
    background: "#e2e8f0",
    border: "1px solid #cbd5e1",
    borderRadius: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  btnDisabled: { opacity: 0.7, cursor: "not-allowed" },

  /* Right content */
  content: { display: "grid", gap: 16, alignContent: "start" },

  rightHeader: {
    background: "linear-gradient(120deg, #eef2ff, #e6fffb)",
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    padding: 16,
  },
  heroTitle: {
    margin: "8px 0 6px 0",
    fontSize: 26,
    lineHeight: 1.2,
    color: colors.ink,
    fontWeight: 800,
  },
  heroSub: { margin: "0 0 12px 0", color: colors.inkSoft, fontSize: 14 },

  badge: {
    display: "inline-flex",
    alignItems: "center",
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

  resultShell: {
    background: colors.card,
    border: `1px solid ${colors.border}`,
    borderRadius: 16,
    boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
    padding: 16,
  },
  resultHeader: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  resultTitle: { margin: 0, color: colors.ink },
  metaPill: {
    padding: "6px 10px",
    background: "#f8fafc",
    borderRadius: 999,
    fontSize: 12,
    color: "#475569",
    border: `1px solid ${colors.border}`,
  },

  resultsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 14,
    marginTop: 12,
  },

  resultCard: {
    background: "#fff",
    border: `1px solid ${colors.border}`,
    borderRadius: 14,
    padding: 14,
  },
  resultCardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
    minWidth: 0,
  },
  pct: {
    fontWeight: 800,
    color: colors.ink,
    border: `1px solid ${colors.border}`,
    padding: "4px 8px",
    borderRadius: 999,
    minWidth: 56,
    textAlign: "center",
    flexShrink: 0,
  },

  progressOuter: {
    width: "100%",
    height: 10,
    background: "#f1f5f9",
    borderRadius: 999,
    overflow: "hidden",
    marginBottom: 10,
  },
  progressInner: { height: "100%", background: colors.accent },

  kvRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginTop: 6,
  },
  kv: {
    background: "#f8fafc",
    border: `1px solid ${colors.border}`,
    borderRadius: 10,
    padding: 10,
  },
  kvLabel: { fontWeight: 700, color: colors.ink, marginBottom: 6 },
  tagsWrap: { display: "flex", flexWrap: "wrap", gap: 8 },

  matchTag: {
    background: colors.goodSoft,
    color: "#065f46",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid #bbf7d0",
  },
  missTag: {
    background: colors.missSoft,
    color: "#9f1239",
    padding: "6px 10px",
    borderRadius: 999,
    fontSize: 12,
    border: "1px solid #fecdd3",
  },
  emptyTag: { color: "#94a3b8", fontStyle: "italic", fontSize: 12 },

  cardActions: { display: "flex", justifyContent: "flex-end", marginTop: 10 },
  enhanceBtn: {
    padding: "10px 14px",
    backgroundColor: "#2563eb",
    color: "#fff",
    border: "1px solid #1e40af",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 700,
  },
};

const insights = {
  card: { display: "none" },
  title: {},
  grid: {},
};
const ul = { margin: "6px 0 0 18px" };

export default ResumeMatcherPage;
