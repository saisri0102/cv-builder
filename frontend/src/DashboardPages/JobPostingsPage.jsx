// src/DashboardPages/JobPostingsPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000";
const SEARCH_URL = `${API_BASE_URL}/api/v1/jobs/search`;
const PER_PAGE = 10; // lock UI to 10 items per page

export default function JobPostingsPage() {
  const [q, setQ] = useState("data analyst");
  const [location, setLocation] = useState(""); // keep empty by default
  const [remote, setRemote] = useState(false);  // default to false to avoid empty first load
  const [page, setPage] = useState(1);

  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState("");     // show informational messages (e.g., fallback)

  // filters
  const [employmentType, setEmploymentType] = useState("any");
  const [postedWithin, setPostedWithin] = useState("any");
  const [sourceFilter, setSourceFilter] = useState("any");
  const [expLevel, setExpLevel] = useState("any");

  const totalPages = useMemo(() => {
    if (typeof total === "number" && total >= 0) {
      return Math.max(1, Math.ceil(total / PER_PAGE));
    }
    return null;
  }, [total]);

  const sourceOptions = useMemo(() => {
    const uniq = new Set();
    jobs.forEach((j) => j?.source && uniq.add(j.source));
    return ["any", ...Array.from(uniq)];
  }, [jobs]);

  const toApiPostedWithin = (v) => {
    if (v === "1") return "24h";
    if (v === "7") return "7d";
    if (v === "30") return "30d";
    return undefined;
  };

  const fetchJobs = async (nextPage = page, opts = {}) => {
    // opts.localRemote allows a one-off override for the remote flag (used in fallback)
    const localRemote = typeof opts.localRemote === "boolean" ? opts.localRemote : remote;
    setLoading(true);
    setErr("");
    if (!opts.silent) setNotice("");

    try {
      const res = await axios.get(SEARCH_URL, {
        params: {
          q,
          // only send location if it’s a real place (not the literal string "remote")
          location: location && location.toLowerCase() !== "remote" ? location : undefined,
          remote: localRemote,
          page: nextPage,
          per_page: PER_PAGE, // use 10
          employment_type: employmentType === "any" ? undefined : employmentType,
          posted_within: toApiPostedWithin(postedWithin),
          source: sourceFilter === "any" ? undefined : sourceFilter,
          sort_by: "posted_at",
          sort_order: "desc",
        },
      });

      const data = res.data;

      let items = [];
      let totalCount = null;

      if (Array.isArray(data)) {
        items = data;
      } else if (data && Array.isArray(data.items)) {
        items = data.items;
        totalCount = typeof data.total === "number" ? data.total : null;
      }

      // Fallback: if remote-only returned 0, retry once without remote
      if (items.length === 0 && localRemote && !opts.didFallback) {
        const res2 = await axios.get(SEARCH_URL, {
          params: {
            q,
            location: location && location.toLowerCase() !== "remote" ? location : undefined,
            remote: false, // turn off remote
            page: 1,       // reset to first page for clarity
            per_page: PER_PAGE, // use 10
            employment_type: employmentType === "any" ? undefined : employmentType,
            posted_within: toApiPostedWithin(postedWithin),
            source: sourceFilter === "any" ? undefined : sourceFilter,
            sort_by: "posted_at",
            sort_order: "desc",
          },
        });

        const data2 = res2.data;
        let items2 = [];
        let total2 = null;
        if (Array.isArray(data2)) {
          items2 = data2;
        } else if (data2 && Array.isArray(data2.items)) {
          items2 = data2.items;
          total2 = typeof data2.total === "number" ? data2.total : null;
        }

        setJobs(items2);
        setTotal(total2);
        setPage(1);
        setNotice("No remote-only results. Showing broader matches instead.");
        return;
      }

      setJobs(items);
      setTotal(totalCount);
    } catch (e) {
      console.error(e);
      setErr("Failed to fetch jobs. Please try again.");
      setJobs([]);
      setTotal(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    setPage(1);
    fetchJobs(1);
  };
  const handlePrev = () => {
    if (page > 1) {
      const p = page - 1;
      setPage(p);
      fetchJobs(p);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };
  const handleNext = () => {
    if (totalPages && page >= totalPages) return; // disable moving past last page
    const p = page + 1;
    setPage(p);
    fetchJobs(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filteredJobs = useMemo(() => {
    const wantExp = (v) => {
      if (expLevel === "any") return true;
      const hay = [v?.title, v?.description].filter(Boolean).join(" ").toLowerCase();
      if (expLevel === "junior") return /\b(junior|entry|new grad|0-2\s*years)\b/.test(hay);
      if (expLevel === "mid") return /\b(mid|intermediate|3-5\s*years)\b/.test(hay);
      if (expLevel === "senior") return /\b(senior|sr\.?|6\+?\s*years|principal)\b/.test(hay);
      if (expLevel === "lead") return /\b(lead|staff|principal|manager)\b/.test(hay);
      return true;
    };
    return jobs.filter((j) => wantExp(j));
  }, [jobs, expLevel]);

  return (
    <div className="jobs-wrap">
      <style>{css}</style>

      <header className="header">
        <h2 className="title">
          📌 Job Postings <span className="muted">(Aggregated)</span>
        </h2>

        {/* Top search */}
        <div className="filters top">
          <input
            className="input"
            placeholder="Keywords (e.g., data analyst)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <input
            className="input"
            placeholder="Location (e.g., New York or leave blank for anywhere)"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={remote}
              onChange={(e) => setRemote(e.target.checked)}
            />
            <span>Remote</span>
          </label>
          <button className="btn primary" onClick={handleSearch} disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </div>

        {/* Filters row */}
        <div className="filters bottom">
          <select
            className="select"
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
          >
            <option value="any">Employment type — Any</option>
            <option value="full-time">Full-time</option>
            <option value="part-time">Part-time</option>
            <option value="contract">Contract</option>
            <option value="internship">Internship</option>
            <option value="temporary">Temporary</option>
          </select>

          <select
            className="select"
            value={postedWithin}
            onChange={(e) => setPostedWithin(e.target.value)}
          >
            <option value="any">Posted — Any time</option>
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
          </select>

          <select
            className="select"
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            {sourceOptions.map((src) => (
              <option key={src} value={src}>
                {src === "any" ? "Source — Any" : src}
              </option>
            ))}
          </select>

          <select
            className="select"
            value={expLevel}
            onChange={(e) => setExpLevel(e.target.value)}
          >
            <option value="any">Experience — Any</option>
            <option value="junior">Junior / Entry</option>
            <option value="mid">Mid</option>
            <option value="senior">Senior</option>
            <option value="lead">Lead / Staff</option>
          </select>

          <button
            className="btn subtle-btn"
            onClick={() => {
              setEmploymentType("any");
              setPostedWithin("any");
              setSourceFilter("any");
              setExpLevel("any");
            }}
          >
            Reset
          </button>
        </div>

        {!loading && (
          <div className="subtle">
            Showing {filteredJobs.length} result{filteredJobs.length === 1 ? "" : "s"}
            {typeof total === "number" ? ` (server total: ${total})` : ""}
          </div>
        )}

        {/* Notice for fallbacks */}
        {!loading && notice && <div className="notice">{notice}</div>}
      </header>

      {err && <div className="alert">{err}</div>}

      {loading && (
        <div className="list">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="card skeleton" key={i}>
              <div className="s-line w40" />
              <div className="s-line w20" />
              <div className="s-line w30" />
              <div className="s-line w90" />
              <div className="s-line w80" />
            </div>
          ))}
        </div>
      )}

      {!loading && filteredJobs.length > 0 && (
        <>
          <div className="list">
            {filteredJobs.map((job, idx) => (
              <JobCard job={job} key={idx} />
            ))}
          </div>

          <div className="pager">
            <button className="btn nav" onClick={handlePrev} disabled={loading || page === 1}>
              ◀ Prev
            </button>
            <span className="page-ind">
              Page {page}
              {totalPages ? ` of ${totalPages}` : ""}
              {typeof total === "number" ? ` • Showing ${filteredJobs.length} of ${total}` : ""}
            </span>
            <button
              className="btn nav"
              onClick={handleNext}
              disabled={loading || (totalPages ? page >= totalPages : false)}
            >
              Next ▶
            </button>
          </div>
        </>
      )}

      {!loading && filteredJobs.length === 0 && !err && (
        <div className="empty">
          <div className="empty-emoji">🔎</div>
          <h3>No jobs match these filters</h3>
          <p>Try clearing filters or broadening your keywords.</p>
        </div>
      )}
    </div>
  );
}

function JobCard({ job }) {
  const {
    title,
    company,
    location,
    salary,
    description,
    url,
    posted_at,
    employment_type,
    source,
  } = job || {};

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h3 className="job-title">{title || "Untitled role"}</h3>
          <div className="meta">
            {company && <span className="chip">{company}</span>}
            {location && <span className="chip soft">{location}</span>}
            {employment_type && <span className="chip soft">{employment_type}</span>}
          </div>
        </div>

        <div className="right-top">
          {salary && <div className="salary">{salary}</div>}
          {posted_at && <div className="posted">📅 {formatDate(posted_at)}</div>}
        </div>
      </div>

      {description && (
        <p className="desc">
          {description.slice(0, 240)}
          {description.length > 240 ? "…" : ""}
        </p>
      )}

      <div className="card-foot">
        <div className="source">
          🔗 Source: <span className="badge">{source || "Unknown"}</span>
        </div>
        {url && (
          <a className="btn apply" href={url} target="_blank" rel="noopener noreferrer">
            Apply Now →
          </a>
        )}
      </div>
    </article>
  );
}

function formatDate(v) {
  try {
    if (v === null || v === undefined || v === "") return "";
    const num = Number(v);
    if (Number.isFinite(num)) {
      if (num >= 1e12) return new Date(num).toLocaleDateString();
      if (num >= 1e9) return new Date(num * 1000).toLocaleDateString();
    }
    const d = new Date(v);
    if (!isNaN(d)) return d.toLocaleDateString();
  } catch (_) {}
  return String(v);
}

/* ---------------- UI CSS ---------------- */
const css = `
.jobs-wrap { max-width: 1000px; margin: 0 auto; padding: 28px; font-family: Inter, sans-serif; }
.header { position: sticky; top: 0; z-index: 10; backdrop-filter: blur(8px);
  background: linear-gradient(135deg, #f9fafb, #eef2ff); padding: 18px 0 16px; margin-bottom: 16px;
  border-bottom: 1px solid #e5e7eb; box-shadow: 0 2px 6px rgba(0,0,0,0.04);
}
.title { margin: 0 0 14px; font-size: 26px; font-weight: 800; color: #1e293b; }
.muted { font-weight: 600; color: #64748b; font-size: 16px; }

/* Filters */
.filters { display: grid; gap: 10px; align-items: center; }
.filters.top { grid-template-columns: 1.5fr 1.2fr auto auto; background:#fff; padding:12px 16px;
  border-radius:14px; box-shadow:0 2px 6px rgba(0,0,0,0.06); margin-bottom:12px; }
.filters.bottom { grid-template-columns: repeat(5,1fr); margin-top: 8px; gap: 12px; }

.input, .select {
  width: 100%; height: 42px; padding: 10px 12px;
  font-size: 14px; border: 1px solid #d1d5db; border-radius: 12px;
  background: #f9fafb; transition:border-color .2s, box-shadow .2s;
}
.input:focus, .select:focus { border-color:#2563eb; box-shadow:0 0 0 2px rgba(37,99,235,.2); }
.input::placeholder { color:#9ca3af; }
.select { appearance: none; }
.checkbox { display:flex; align-items:center; gap:6px; font-size:14px; }

/* Buttons */
.btn { padding: 10px 16px; border-radius: 12px; border:1px solid transparent;
  cursor:pointer; font-weight:600; transition:all .2s; height:42px; display:inline-flex; align-items:center; justify-content:center;
}
.btn.primary { background:#2563eb; color:#fff; }
.btn.primary:hover { background:#1d4ed8; }
.btn.subtle-btn { background:#f3f4f6; color:#374151; border-color:#d1d5db; }
.btn.subtle-btn:hover { background:#e5e7eb; }
.btn.nav { background:#fff; border:1px solid #d1d5db; color:#111827; }
.btn.nav:hover { background:#f3f4f6; }
.btn.apply { background:#16a34a; border:1px solid #16a34a; color:#fff; }
.btn.apply:hover { background:#15803d; }

/* Card */
.notice { margin-top: 10px; padding: 10px 12px; background:#ecfeff; border:1px solid #a5f3fc; color:#075985; border-radius:10px; }
.list { display:grid; gap:18px; margin-top:18px; }
.card { background:#fff; border:1px solid #e5e7eb; border-radius:18px; padding:20px;
  box-shadow:0 2px 10px rgba(0,0,0,0.04); transition:transform .15s, box-shadow .15s;
}
.card:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(0,0,0,0.08); }
.card-head { display:flex; justify-content:space-between; gap:16px; }
.job-title { margin:0 0 6px; font-size:19px; font-weight:800; color: #111827; }
.meta { display:flex; flex-wrap:wrap; gap:8px; }
.chip { padding:4px 10px; border-radius:999px; background:#eef2ff; font-weight:600; font-size:12px; color:#1e293b; }
.chip.soft { background:#f3f4f6; color:#374151; }

.right-top { display:flex; flex-direction:column; align-items:flex-end; gap:6px; }
.salary { font-weight:700; color:#0f766e; background:#ecfdf5; padding:3px 8px; border-radius:8px; font-size:13px; }
.posted { font-size:12px; color:#6b7280; }

.desc { margin:12px 0 10px; color:#374151; line-height:1.5; font-size:14px; }

.card-foot { display:flex; justify-content:space-between; align-items:center; margin-top:10px; }
.source { font-size:12px; color:#6b7280; }
.badge { padding:3px 8px; border-radius:999px; background:#e0f2fe; color:#075985; font-weight:700; font-size:12px; }

/* Pager */
.pager { display:flex; justify-content:center; align-items:center; gap:12px; margin:20px 0; }
.page-ind { color:#374151; font-weight:600; }

/* Empty & Alerts */
.subtle { margin-top:6px; color:#6b7280; font-size:13px; }
.alert { margin-top:14px; padding:12px 14px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; border-radius:10px; }
.empty { text-align:center; padding:50px 10px; color:#6b7280; }
.empty-emoji { font-size:42px; margin-bottom:8px; }

/* Skeletons */
.skeleton .s-line { height:12px; border-radius:6px; background:linear-gradient(90deg,#f3f4f6,#e5e7eb,#f3f4f6);
  background-size:200% 100%; animation:shimmer 1.2s infinite; margin-bottom:10px; }
.skeleton .w20 { width:20%; } .skeleton .w30 { width:30%; } .skeleton .w40 { width:40%; }
.skeleton .w80 { width:80%; } .skeleton .w90 { width:90%; }
@keyframes shimmer { 0% { background-position:0% 0; } 100% { background-position:-200% 0; } }

/* Responsive */
@media (max-width: 1100px) {
  .filters.bottom { grid-template-columns: 1fr 1fr 1fr auto auto; }
}
@media (max-width: 900px) {
  .filters.top { grid-template-columns: 1fr; }
  .filters.bottom { grid-template-columns: 1fr 1fr; }
  .card-head { flex-direction: column; align-items: flex-start; }
  .card-foot { flex-direction: column; align-items: flex-start; gap: 12px; }
}
`;
