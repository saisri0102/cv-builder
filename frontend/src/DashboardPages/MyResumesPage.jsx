// src/DashboardPages/MyResumesPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import api, { API_BASE } from "../lib/api";
import { saveAs } from "file-saver";
import { Document, Packer, Paragraph } from "docx";
import jsPDF from "jspdf";

/* ---------------- Local Favorites Storage ---------------- */
const PINS_KEY = "pinned_resumes_v1";
const normalizeId = (id) => (id == null ? "" : String(id));
const loadPins = () => {
  try {
    const raw = localStorage.getItem(PINS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set((Array.isArray(arr) ? arr : []).map(normalizeId));
  } catch {
    return new Set();
  }
};
const savePins = (setLike) => {
  try {
    localStorage.setItem(PINS_KEY, JSON.stringify(Array.from(setLike || [])));
  } catch {}
};

/* ---------------- Tiny dropdown component ---------------- */
function useClickAway(closeFn) {
  const ref = useRef(null);
  useEffect(() => {
    const onDocClick = (e) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target)) closeFn?.();
    };
    const onKey = (e) => e.key === "Escape" && closeFn?.();
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [closeFn]);
  return ref;
}

function Dropdown({ label, buttonStyle, children, align = "left", title }) {
  const [open, setOpen] = useState(false);
  const ref = useClickAway(() => setOpen(false));
  return (
    <div ref={ref} style={styles.dropdownWrap}>
      <button
        type="button"
        title={title}
        onClick={() => setOpen((s) => !s)}
        style={{ ...styles.btnBase, ...buttonStyle }}
      >
        {label}
      </button>
      {open && (
        <div
          style={{
            ...styles.menu,
            left: align === "left" ? 0 : "auto",
            right: align === "right" ? 0 : "auto",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, children, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ ...styles.menuItem, ...(danger ? styles.menuItemDanger : null) }}
    >
      {children}
    </button>
  );
}

/* ---------------- API helpers ---------------- */
const RESUME_GET_URL = (id) => `${API_BASE}/api/v1/resume/${id}`;
const RESUME_DELETE_URL = (id) => `${API_BASE}/api/v1/resume/${id}`;
const RESUME_RENAME_URL_PRIMARY = (id) => `${API_BASE}/api/v1/resume/${id}/rename`;
const RESUME_RENAME_URL_FALLBACK = (id) => `${API_BASE}/api/v1/resume/id/${id}/rename`;

const isCanceled = (e) =>
  e?.code === "ERR_CANCELED" ||
  e?.name === "CanceledError" ||
  e?.message === "canceled" ||
  e?.cause?.name === "AbortError";

// normalize doc_type best-effort
const getDocType = (r) => {
  const v =
    (r?.doc_type || r?.type || r?.kind || (r?.is_cover ? "cover" : "")) + "";
  const low = v.toLowerCase();
  if (low === "cover" || low === "cover_letter" || low === "coverletter") return "cover";
  if (low === "resume" || low === "cv") return "resume";
  return "resume"; // default to resume if unknown
};

// Map API item -> uniform shape
const normalize = (it) => ({
  id: it?.id ?? it?.resume_id ?? it?.doc_id ?? it?.uuid ?? it?.pk,
  title: it?.title ?? it?.name ?? it?.resume_title ?? it?.label ?? "Untitled",
  content: it?.content ?? it?.text ?? it?.raw_text ?? it?.body ?? "",
  created_at: it?.created_at ?? it?.createdAt ?? it?.created ?? it?.timestamp,
  source: it?.source ?? it?.origin ?? "other",
  doc_type: getDocType(it),
});

/* ---------------- exporters ---------------- */
const safeName = (t, ext) =>
  `${(t || "document").toString().trim().replace(/[\/\\?%*:|"<>]/g, "").replace(/\s+/g, "_") || "document"}.${ext}`;

const downloadDOCX = async (title, content) => {
  const text = content || "";
  const paragraphs = (text ? text.split(/\r?\n/) : [""]).map(
    (line) => new Paragraph({ text: line })
  );
  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, safeName(title || "resume", "docx"));
};

const downloadPDF = (title, content) => {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const left = 48, top = 56, lineHeight = 16;
  const pageH = doc.internal.pageSize.getHeight();
  const maxW = doc.internal.pageSize.getWidth() - left * 2;
  const lines = (content || "").split(/\r?\n/);
  let y = top;
  doc.setFont("Times", "Normal");
  doc.setFontSize(12);

  const write = (t) => {
    const wrapped = doc.splitTextToSize(t, maxW);
    for (const wl of wrapped) {
      if (y + lineHeight > pageH - top) {
        doc.addPage(); y = top;
      }
      doc.text(wl, left, y);
      y += lineHeight;
    }
  };

  lines.forEach((ln, i) => {
    if (ln.trim() === "" && i !== 0) {
      y += lineHeight;
      if (y > pageH - top) { doc.addPage(); y = top; }
    } else {
      write(ln);
    }
  });

  doc.save(safeName(title || "resume", "pdf"));
};

/* ==================== Component ==================== */
export default function MyResumesPage() {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [tagFilter, setTagFilter] = useState("all");
  const [docFilter, setDocFilter] = useState("resumes");

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  // ⭐ favorites
  const [pinned, setPinned] = useState(() => loadPins());

  // Try common list endpoints (favor ones that support doc_type=resume)
  async function listResumes(signal) {
    const candidates = [
      { url: `${API_BASE}/api/v1/resume/mine`, params: { doc_type: "resume", limit: 100 } },
      { url: `${API_BASE}/api/v1/resume`,      params: { page: 1, limit: 100, doc_type: "resume" } },
      { url: `${API_BASE}/api/v1/resume/`,     params: { page: 1, limit: 100, doc_type: "resume" } },
      // Fallbacks without filter (we'll filter client-side)
      { url: `${API_BASE}/api/v1/resume/mine`, params: {} },
      { url: `${API_BASE}/api/v1/resume`,      params: { page: 1, limit: 100 } },
      { url: `${API_BASE}/api/v1/resume/`,     params: { page: 1, limit: 100 } },
      { url: `${API_BASE}/api/v1/resume/list`, params: { page: 1, limit: 100 } },
    ];

    let lastErr = null;
    for (const c of candidates) {
      try {
        const { data } = await api.get(c.url, { params: c.params, signal });
        const raw = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
        if (raw) {
          const items = raw.map(normalize).filter((x) => x?.id != null);
          return { items };
        }
      } catch (e) {
        if (isCanceled(e)) throw e;
        lastErr = e;
        const code = e?.response?.status;
        if (![404, 422, 405].includes(code)) break;
      }
    }
    throw lastErr || new Error("No suitable list endpoint responded with items.");
  }

  const fetchResumes = async (signal) => {
    setLoading(true);
    setErrMsg("");
    try {
      const { items } = await listResumes(signal);
      setResumes(items);
    } catch (err) {
      if (isCanceled(err) || signal?.aborted) return;
      console.error("Fetch resumes error:", err?.response?.data || err);
      const payload = err?.response?.data;
      let detail;
      if (Array.isArray(payload?.detail)) {
        const first = payload.detail[0];
        detail = first?.msg || JSON.stringify(first);
      } else {
        detail =
          (typeof payload?.detail === "string" && payload.detail) ||
          (typeof payload?.message === "string" && payload.message) ||
          (typeof payload === "string" && payload) ||
          err?.message ||
          "Failed to fetch resumes.";
      }
      setErrMsg(String(detail));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchResumes(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------- preview helpers -------
  const openPreview = async (item) => {
    setPreviewError("");
    setPreviewLoading(true);
    setPreviewItem({ ...item });
    setPreviewOpen(true);

    try {
      if (!item?.content) {
        const { data } = await api.get(RESUME_GET_URL(item.id));
        const content =
          data?.content ?? data?.text ?? data?.raw_text ?? data?.body ?? "";
        setPreviewItem((prev) => ({ ...prev, ...data, content }));
      }
    } catch (err) {
      if (isCanceled(err)) return;
      console.error("Preview fetch error:", err?.response?.data || err);
      const msg =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to load resume content.";
      setPreviewError(String(msg));
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewItem(null);
    setPreviewError("");
    setPreviewLoading(false);
  };

  const startRename = (item) => {
    setRenamingId(item.id);
    setRenameValue(item.title || "");
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const applyRename = async () => {
    if (!renamingId) return;
    const newTitle = renameValue.trim();
    if (!newTitle) {
      window.alert("Title cannot be empty.");
      return;
    }
    try {
      try {
        const { data } = await api.patch(RESUME_RENAME_URL_PRIMARY(renamingId), { title: newTitle });
        setResumes((prev) => prev.map((r) => (r.id === renamingId ? { ...r, ...normalize(data) } : r)));
      } catch (e) {
        if (e?.response?.status === 404) {
          const { data } = await api.patch(RESUME_RENAME_URL_FALLBACK(renamingId), { title: newTitle });
          setResumes((prev) => prev.map((r) => (r.id === renamingId ? { ...r, ...normalize(data) } : r)));
        } else {
          throw e;
        }
      }
      cancelRename();
    } catch (err) {
      if (isCanceled(err)) return;
      console.error("Rename error:", err?.response?.data || err);
      const msg =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to rename.";
      window.alert(String(msg));
    }
  };

  const confirmDelete = async (id) => {
    const sure = window.confirm("Delete this resume permanently?");
    if (!sure) return;
    try {
      await api.delete(RESUME_DELETE_URL(id));
      setResumes((prev) => prev.filter((r) => r.id !== id));
      // also unpin if pinned
      setPinned((prev) => {
        const n = new Set(prev);
        n.delete(normalizeId(id));
        savePins(n);
        return n;
      });
      if (previewItem?.id === id) closePreview();
    } catch (err) {
      if (isCanceled(err)) return;
      console.error("Delete error:", err?.response?.data || err);
      const msg =
        err?.response?.data?.detail ??
        err?.response?.data?.message ??
        err?.message ??
        "Failed to delete.";
      window.alert(String(msg));
    }
  };

  const copyToClipboard = async (content) => {
    try {
      await navigator.clipboard.writeText(content || "");
      window.alert("Copied to clipboard!");
    } catch {
      window.alert("Copy failed.");
    }
  };

  const downloadTxt = (title, content) => {
    const blob = new Blob([content || ""], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const safe = (title || "resume").replace(/\s+/g, "_");
    link.download = `${safe}.txt`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  /* ------- favorites toggle ------- */
  const togglePin = (id) => {
    const key = normalizeId(id);
    setPinned((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      savePins(n);
      return n;
    });
  };

  const isPinned = (id) => pinned.has(normalizeId(id));

  // ------- filter + sort (with pins first) -------
  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = resumes;

    if (docFilter === "resumes") list = list.filter((r) => getDocType(r) === "resume");
    else if (docFilter === "covers") list = list.filter((r) => getDocType(r) === "cover");

    list = list.filter((r) => {
      const passTag = tagFilter === "all" ? true : (r.source || "other") === tagFilter;
      if (!passTag) return false;
      if (!q) return true;
      const hay = `${r.title || ""} ${r.content || ""} ${r.source || ""}`.toLowerCase();
      return hay.includes(q);
    });

    // primary: pins first
    const byPin = (a, b) => {
      const pa = isPinned(a.id) ? 1 : 0;
      const pb = isPinned(b.id) ? 1 : 0;
      return pb - pa; // pinned first
    };

    // secondary: user's chosen sort
    const byChoice = (a, b) => {
      switch (sortBy) {
        case "oldest":
          return new Date(a.created_at || 0) - new Date(b.created_at || 0);
        case "title-asc":
          return (a.title || "").localeCompare(b.title || "");
        case "title-desc":
          return (b.title || "").localeCompare(a.title || "");
        case "newest":
        default:
          return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      }
    };

    return list.slice().sort((a, b) => {
      const pinOrder = byPin(a, b);
      if (pinOrder !== 0) return pinOrder;
      return byChoice(a, b);
    });
  }, [resumes, query, sortBy, tagFilter, docFilter, pinned]);

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.headerRow}>
          <h2 style={styles.header}>📁 My Resumes</h2>
          <div style={styles.tools}>
            <input
              placeholder="Search title or content..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={styles.search}
              aria-label="Search resumes"
            />
            <select
              value={docFilter}
              onChange={(e) => setDocFilter(e.target.value)}
              style={styles.select}
              aria-label="Filter by document type"
            >
              <option value="resumes">Resumes</option>
              <option value="covers">Cover Letters</option>
              <option value="all">All</option>
            </select>
            <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} style={styles.select} aria-label="Filter by tag">
              <option value="all">All sources</option>
              <option value="enhancer">Enhancer</option>
              <option value="upload">Upload</option>
              <option value="other">Other</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={styles.select} aria-label="Sort resumes">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="title-asc">Title A → Z</option>
              <option value="title-desc">Title Z → A</option>
            </select>
            <button
              onClick={() => fetchResumes()}
              style={styles.reloadBtn}
              title="Reload list"
              type="button"
            >
              ⟳ Reload
            </button>
          </div>
        </div>

        {loading && <p style={{ color: "#666" }}>⏳ Loading your resumes…</p>}

        {!!errMsg && (
          <div style={styles.errorBox}>
            <strong>Fetch error:</strong>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{errMsg}</pre>
          </div>
        )}

        {!loading && !errMsg && filteredSorted.length === 0 && (
          <p style={{ color: "#555" }}>No documents match your filters.</p>
        )}

        <ul style={styles.list}>
          {filteredSorted.map((r) => {
            const isRenamingRow = renamingId === r.id;
            const pinnedNow = isPinned(r.id);
            return (
              <li key={r.id} style={styles.item}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  {/* ⭐ Pin button */}
                  <button
                    type="button"
                    onClick={() => togglePin(r.id)}
                    title={pinnedNow ? "Unpin" : "Pin to top"}
                    aria-label="Toggle favorite"
                    style={{ ...styles.pinBtn, ...(pinnedNow ? styles.pinActive : null) }}
                  >
                    {pinnedNow ? "⭐" : "☆"}
                  </button>

                  <span style={styles.tag(r.source || "other")}>
                    {(r.source || "other").toUpperCase()}
                  </span>

                  {docFilter === "all" && (
                    <span style={styles.docBadge(getDocType(r))}>
                      {getDocType(r) === "resume" ? "RESUME" : "COVER"}
                    </span>
                  )}

                  {isRenamingRow ? (
                    <>
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        style={styles.renameInput}
                        aria-label="New resume title"
                      />
                      <button style={styles.smallBtn} onClick={applyRename}>✅</button>
                      <button style={styles.smallBtnGhost} onClick={cancelRename}>✖</button>
                    </>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                      <span style={styles.title}>{r.title || "Untitled"}</span>
                      {r.created_at && <span style={styles.date}>{new Date(r.created_at).toLocaleString()}</span>}
                    </div>
                  )}
                </div>

                {/* actions */}
                <div style={styles.actions}>
                  <button
                    style={{ ...styles.btnBase, ...styles.viewBtn }}
                    onClick={() => openPreview(r)}
                    title="Quick preview"
                  >
                    👁️ View
                  </button>

                  <Dropdown
                    label="📥 Download ▼"
                    title="Download as TXT / DOCX / PDF"
                    buttonStyle={styles.downloadBtn}
                    align="left"
                  >
                    <MenuItem onClick={() => downloadTxt(r.title, r.content)}>📝 TXT</MenuItem>
                    <MenuItem onClick={() => downloadDOCX(r.title, r.content)}>📃 DOCX</MenuItem>
                    <MenuItem onClick={() => downloadPDF(r.title, r.content)}>🧾 PDF</MenuItem>
                  </Dropdown>

                  <Dropdown
                    label="⋯ More"
                    title="More actions"
                    buttonStyle={styles.moreBtn}
                    align="right"
                  >
                    {!isRenamingRow ? (
                      <MenuItem onClick={() => startRename(r)}>✏️ Rename</MenuItem>
                    ) : (
                      <>
                        <MenuItem onClick={applyRename}>✅ Save name</MenuItem>
                        <MenuItem onClick={cancelRename}>✖ Cancel rename</MenuItem>
                      </>
                    )}
                    <MenuItem onClick={() => copyToClipboard(r.content)}>📋 Copy</MenuItem>
                    <MenuItem danger onClick={() => confirmDelete(r.id)}>🗑️ Delete</MenuItem>
                  </Dropdown>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Preview Modal */}
      {previewOpen && previewItem && (
        <div style={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <strong style={{ fontSize: 16 }}>
                {previewItem.title || "Untitled"}
              </strong>
              <button style={styles.modalClose} onClick={closePreview} aria-label="Close">✖</button>
            </div>
            <div style={styles.modalBody}>
              {previewLoading ? (
                <p style={{ color: "#666", margin: 0 }}>Loading content…</p>
              ) : previewError ? (
                <div style={styles.errorBox}><strong>Error:</strong> <span>{previewError}</span></div>
              ) : (
                <pre style={styles.pre}>{previewItem?.content || "No content."}</pre>
              )}
            </div>
            {/* Footer: only Close (download dropdown removed) */}
            <div style={styles.modalFooter}>
              <button style={styles.secondary} onClick={closePreview}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Styles ---------------- */
const styles = {
  // layout
  page: { fontFamily: "Segoe UI, sans-serif", backgroundColor: "#fdf6ec", minHeight: "100vh", padding: "40px", display: "flex", justifyContent: "center" },
  card: { backgroundColor: "#fff", padding: "30px", borderRadius: "12px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)", width: "100%", maxWidth: "980px" },
  headerRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 16 },
  header: { margin: 0, fontSize: "1.8rem", color: "#333" },
  tools: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },

  // controls
  search: { padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8, minWidth: 220 },
  select: { padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8 },
  reloadBtn: { padding: "8px 10px", background: "#0f172a", color: "#fff", border: "1px solid #0f172a", borderRadius: 8, cursor: "pointer" },

  // list + items
  errorBox: { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", padding: "10px 12px", borderRadius: 8, margin: "8px 0 16px" },
  list: { listStyle: "none", padding: 0, margin: 0 },
  item: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #eee", gap: 12 },

  // ⭐ pin button
  pinBtn: {
    border: "1px solid #e5e7eb",
    background: "#fff",
    borderRadius: 8,
    padding: "4px 7px",
    cursor: "pointer",
    fontSize: 16,
    lineHeight: 1,
  },
  pinActive: {
    background: "#fff7cc",
    borderColor: "#fde68a",
  },

  tag: (src) => ({
    fontSize: 11, padding: "2px 8px", borderRadius: 999,
    background: src === "enhancer" ? "#def7ec" : src === "upload" ? "#e0e7ff" : "#fef3c7",
    color: src === "enhancer" ? "#047857" : src === "upload" ? "#3730a3" : "#92400e",
    border: src === "enhancer" ? "1px solid #a7f3d0" : src === "upload" ? "1px solid #c7d2fe" : "1px solid #fde68a",
  }),
  docBadge: (kind) => ({
    fontSize: 10, padding: "2px 6px", borderRadius: 6, border: "1px solid #ddd",
    background: kind === "resume" ? "#eef2ff" : "#fff7ed", color: "#334155",
  }),
  title: { fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 420 },
  date: { fontSize: "0.85rem", color: "#777" },

  // actions
  actions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  btnBase: { border: "none", borderRadius: 8, padding: "6px 10px", cursor: "pointer" },
  viewBtn: { backgroundColor: "#10b981", color: "#fff" },
  downloadBtn: { backgroundColor: "#2563eb", color: "#fff" },
  moreBtn: { backgroundColor: "#6b7280", color: "#fff" },

  // dropdown
  dropdownWrap: { position: "relative", display: "inline-block" },
  menu: {
    position: "absolute",
    top: "calc(100% + 6px)",
    minWidth: 160,
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
    padding: 6,
    zIndex: 50,
  },
  menuItem: {
    display: "block",
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    borderRadius: 8,
    padding: "8px 10px",
    cursor: "pointer",
    color: "#111827",
  },
  menuItemDanger: { color: "#dc2626" },

  // rename controls
  renameInput: { padding: "6px 8px", border: "1px solid #ddd", borderRadius: 6, minWidth: 220 },
  smallBtn: { backgroundColor: "#10b981", color: "#fff", border: "none", borderRadius: 6, padding: "6px 8px", cursor: "pointer" },
  smallBtnGhost: { backgroundColor: "transparent", color: "#333", border: "1px solid #ccc", borderRadius: 6, padding: "6px 8px", cursor: "pointer" },

  // modal
  modalBackdrop: { position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 1000 },
  modal: { background: "#fff", width: "min(900px, 100%)", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,.25)", overflow: "hidden", display: "grid", gridTemplateRows: "auto 1fr auto" },
  modalHeader: { padding: "12px 16px", borderBottom: "1px solid #eee", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  modalClose: { background: "transparent", border: "1px solid #ddd", borderRadius: 8, padding: "4px 8px", cursor: "pointer" },
  modalBody: { padding: 16, maxHeight: "65vh", overflow: "auto" },
  pre: {
    margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.45,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace", fontSize: 14, color: "#222"
  },
  modalFooter: { borderTop: "1px solid #eee", padding: "10px 16px", display: "flex", justifyContent: "flex-end", gap: 8 },
  secondary: { backgroundColor: "transparent", color: "#333", border: "1px solid #ccc", borderRadius: 8, padding: "8px 12px", cursor: "pointer" },
};
