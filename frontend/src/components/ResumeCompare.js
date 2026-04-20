// src/components/ResumeCompare.jsx
import React, { useMemo, useState } from "react";

// Use the same pattern as your Enhance page
const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
const COMPARE_URL = `${API_BASE_URL}/api/v1/compare/`;

const ResumeCompare = () => {
  // inputs
  const [resumes, setResumes] = useState([]);
  const [jdMode, setJdMode] = useState("text"); // 'text' | 'file'
  const [jdText, setJdText] = useState("");
  const [jdFile, setJdFile] = useState(null);

  // options
  const [comparisonType, setComparisonType] = useState("overall"); // word | skill | overall
  const [returnText, setReturnText] = useState(true);
  const [maxPdfPages, setMaxPdfPages] = useState(40);
  const [topN, setTopN] = useState(10); // null = unlimited

  // state
  const [loading, setLoading] = useState(false);
  const [serverErr, setServerErr] = useState("");
  const [resp, setResp] = useState(null); // { jd_text, results[], summary }

  // helpers
  const acceptExt = ".pdf,.docx,.txt";
  const resumeCount = useMemo(() => resumes.length, [resumes]);

  const handleResumes = (files) => {
    const arr = Array.from(files || []);
    setResumes(arr);
  };

  const validate = () => {
    if (!resumeCount) return "Please add at least one resume file (.pdf, .docx, .txt).";
    if (jdMode === "text" && !jdText.trim()) return "Please paste the job description text.";
    if (jdMode === "file" && !jdFile) return "Please upload a JD file.";
    if (maxPdfPages <= 0) return "Max PDF pages must be a positive number.";
    if (topN !== null && (isNaN(topN) || topN < 0)) return "Top N must be 0 or greater (or leave blank).";
    return "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerErr("");
    setResp(null);

    const problem = validate();
    if (problem) {
      setServerErr(problem);
      return;
    }

    const fd = new FormData();
    resumes.forEach((f) => fd.append("resumes", f));
    if (jdMode === "file" && jdFile) {
      fd.append("jd_file", jdFile);
    } else {
      fd.append("jd_text", jdText);
    }
    fd.append("comparison_type", comparisonType);
    fd.append("return_text", String(returnText));
    fd.append("max_pdf_pages", String(maxPdfPages));
    if (topN === null || topN === "" || typeof topN === "undefined") {
      // do not send to use backend default
    } else {
      fd.append("top_n_keywords", String(topN));
    }

    setLoading(true);
    try {
      const res = await fetch(COMPARE_URL, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.detail || `Server error (${res.status})`;
        throw new Error(msg);
      }
      const data = await res.json();
      setResp(data);
    } catch (err) {
      console.error("❌ Compare failed:", err);
      setServerErr(err?.message || "Failed to compare. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetAll = () => {
    setResumes([]);
    setJdMode("text");
    setJdText("");
    setJdFile(null);
    setComparisonType("overall");
    setReturnText(true);
    setMaxPdfPages(40);
    setTopN(10);
    setServerErr("");
    setResp(null);
  };

  return (
    <div style={styles.wrap}>
      <h2 style={styles.h2}>Resume vs Job Description</h2>

      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Resumes */}
        <section style={styles.section}>
          <h4 style={styles.h4}>Resumes</h4>
          <input
            type="file"
            accept={acceptExt}
            multiple
            onChange={(e) => handleResumes(e.target.files)}
          />
          <p style={styles.hint}>
            You can select multiple files. Allowed: <code>.pdf, .docx, .txt</code>
          </p>

          {!!resumeCount && (
            <ul style={styles.fileList}>
              {resumes.map((f, i) => (
                <li key={i}>
                  {f.name} <span style={styles.dim}>({Math.ceil(f.size / 1024)} KB)</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* JD input */}
        <section style={styles.section}>
          <h4 style={styles.h4}>Job Description</h4>
          <div style={styles.row}>
            <label style={styles.rowLabel}>
              <input
                type="radio"
                name="jdmode"
                value="text"
                checked={jdMode === "text"}
                onChange={() => setJdMode("text")}
              />
              <span style={styles.radioLabel}>Paste Text</span>
            </label>
            <label style={styles.rowLabel}>
              <input
                type="radio"
                name="jdmode"
                value="file"
                checked={jdMode === "file"}
                onChange={() => setJdMode("file")}
              />
              <span style={styles.radioLabel}>Upload File</span>
            </label>
          </div>

          {jdMode === "text" ? (
            <textarea
              rows={8}
              placeholder="Paste job description here"
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              style={styles.textarea}
            />
          ) : (
            <div>
              <input
                type="file"
                accept={acceptExt}
                onChange={(e) => setJdFile(e.target.files?.[0] || null)}
              />
              {jdFile && (
                <p style={styles.dim}>
                  Selected: {jdFile.name} ({Math.ceil(jdFile.size / 1024)} KB)
                </p>
              )}
            </div>
          )}
        </section>

        {/* Options */}
        <section style={styles.section}>
          <h4 style={styles.h4}>Options</h4>
          <div style={styles.optionsGrid}>
            <div>
              <label style={styles.label}>Comparison Type</label>
              <select
                value={comparisonType}
                onChange={(e) => setComparisonType(e.target.value)}
                style={styles.select}
              >
                <option value="word">Word</option>
                <option value="skill">Skill</option>
                <option value="overall">Overall (Weighted)</option>
              </select>
            </div>

            <div>
              <label style={styles.label}>Max PDF Pages</label>
              <input
                type="number"
                min={1}
                value={maxPdfPages}
                onChange={(e) => setMaxPdfPages(parseInt(e.target.value || "1", 10))}
                style={styles.input}
              />
            </div>

            <div>
              <label style={styles.label}>Top N Keywords (optional)</label>
              <input
                type="number"
                min={0}
                value={topN ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setTopN(v === "" ? null : parseInt(v, 10));
                }}
                placeholder="Leave blank for all"
                style={styles.input}
              />
            </div>

            <div style={{ alignSelf: "end" }}>
              <label style={styles.checkbox}>
                <input
                  type="checkbox"
                  checked={returnText}
                  onChange={(e) => setReturnText(e.target.checked)}
                />
                Include normalized texts in response
              </label>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div style={styles.actions}>
          <button type="submit" disabled={loading} style={styles.btnPrimary}>
            {loading ? "Comparing..." : "Compare"}
          </button>
          <button type="button" disabled={loading} onClick={resetAll} style={styles.btnGhost}>
            Reset
          </button>
        </div>
      </form>

      {/* Errors */}
      {serverErr && <p style={styles.error}>{serverErr}</p>}

      {/* Results */}
      {resp && (
        <section style={styles.results}>
          <h3 style={styles.h3}>Results</h3>

          {/* Summary */}
          {resp.summary && (
            <div style={styles.summaryCard}>
              <div>
                <div style={styles.summaryRow}>
                  <span style={styles.summaryKey}>Compared Files:</span>
                  <span style={styles.summaryVal}>{resp.summary.count ?? "-"}</span>
                </div>
                <div style={styles.summaryRow}>
                  <span style={styles.summaryKey}>Average Match:</span>
                  <span style={styles.summaryVal}>
                    {resp.summary.average_match ?? "-"}%
                  </span>
                </div>
              </div>
              <div>
                <div style={styles.summaryRow}>
                  <span style={styles.summaryKey}>Best Match:</span>
                  <span style={styles.summaryVal}>
                    {resp.summary.best_match
                      ? `${resp.summary.best_match.fileName} (${resp.summary.best_match.match_percentage}%)`
                      : "-"}
                  </span>
                </div>
                <div style={styles.summaryRow}>
                  <span style={styles.summaryKey}>Mode:</span>
                  <span style={styles.summaryVal}>{resp.summary.comparison_type}</span>
                </div>
              </div>
            </div>
          )}

          {/* Per-file table */}
          <div style={{ overflowX: "auto" }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>File</th>
                  <th style={styles.th}>Match %</th>
                  <th style={styles.th}>Matched Keywords</th>
                  <th style={styles.th}>Unmatched Keywords</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {(resp.results || []).map((r, idx) => (
                  <tr key={idx}>
                    <td style={styles.td}>{r.fileName}</td>
                    <td style={styles.td}>{r.match_percentage ?? "-"}</td>
                    <td style={styles.td}>
                      {Array.isArray(r.matched_keywords) && r.matched_keywords.length
                        ? r.matched_keywords.join(", ")
                        : "—"}
                    </td>
                    <td style={styles.td}>
                      {Array.isArray(r.unmatched_keywords) && r.unmatched_keywords.length
                        ? r.unmatched_keywords.join(", ")
                        : "—"}
                    </td>
                    <td style={styles.td}>
                      {r.error ? <span style={styles.badgeError}>Error</span> : <span style={styles.badgeOk}>OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Optional: show JD & resume texts if included */}
          {returnText && (
            <details style={styles.details}>
              <summary style={styles.summaryToggle}>Show normalized JD text</summary>
              <pre style={styles.pre}>{resp.jd_text || "(empty)"}</pre>
            </details>
          )}
          {returnText &&
            (resp.results || []).map((r, idx) => (
              <details key={`rt-${idx}`} style={styles.details}>
                <summary style={styles.summaryToggle}>Show normalized resume: {r.fileName}</summary>
                <pre style={styles.pre}>{r.resume_text || "(empty)"}</pre>
              </details>
            ))}
        </section>
      )}
    </div>
  );
};

const styles = {
  wrap: { padding: 20, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" },
  h2: { margin: "0 0 12px" },
  h3: { margin: "24px 0 8px" },
  h4: { margin: "8px 0" },
  form: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 },
  section: { margin: "12px 0 16px" },
  hint: { fontSize: 12, color: "#6b7280", marginTop: 6 },
  fileList: { margin: "8px 0 0 16px" },
  row: { display: "flex", gap: 16, alignItems: "center", marginBottom: 8 },
  rowLabel: { display: "flex", gap: 8, alignItems: "center", cursor: "pointer" },
  radioLabel: { fontSize: 14 },
  textarea: { width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" },
  optionsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 },
  label: { display: "block", fontSize: 13, marginBottom: 6 },
  input: { width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" },
  select: { width: "100%", padding: 8, borderRadius: 8, border: "1px solid #d1d5db" },
  checkbox: { display: "flex", alignItems: "center", gap: 8 },
  actions: { display: "flex", gap: 12, marginTop: 8 },
  btnPrimary: { padding: "8px 14px", borderRadius: 10, background: "#111827", color: "#fff", border: "none", cursor: "pointer" },
  btnGhost: { padding: "8px 14px", borderRadius: 10, background: "transparent", border: "1px solid #d1d5db", cursor: "pointer" },
  error: { color: "#b91c1c", marginTop: 10 },
  results: { marginTop: 18, border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 },
  summaryCard: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: 12, border: "1px solid #e5e7eb", borderRadius: 12, marginBottom: 12 },
  summaryRow: { display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0" },
  summaryKey: { color: "#6b7280" },
  summaryVal: { fontWeight: 600 },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 8, fontSize: 14 },
  th: { textAlign: "left", borderBottom: "1px solid #e5e7eb", padding: "10px 8px", whiteSpace: "nowrap" },
  td: { borderBottom: "1px solid #f3f4f6", padding: "10px 8px", verticalAlign: "top" },
  badgeOk: { background: "#e6f8ee", color: "#065f46", padding: "2px 8px", borderRadius: 999, fontSize: 12 },
  badgeError: { background: "#fdecec", color: "#991b1b", padding: "2px 8px", borderRadius: 999, fontSize: 12 },
  details: { marginTop: 10, background: "#fafafa", border: "1px solid #eee", borderRadius: 8, padding: "8px 10px" },
  summaryToggle: { cursor: "pointer", fontWeight: 600 },
  pre: { whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12, marginTop: 8 },
  dim: { color: "#6b7280" },
};

export default ResumeCompare;
