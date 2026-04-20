// src/components/DashboardPage.js
import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";

/** Resolve your API base from envs (CRA or Vite), default to localhost:8000 */
const RAW_API =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  "http://localhost:8000";
const API_BASE = String(RAW_API).replace(/\/+$/, ""); // strip trailing slash(es)

/** Small util: format YYYY-MM-DD -> Mon DD */
const shortDate = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
};

/** Pure-SVG sparkline */
const Sparkline = ({ data, height = 60, stroke = "#2563eb", fill = "rgba(37,99,235,.12)" }) => {
  if (!Array.isArray(data) || data.length === 0) return null;
  const width = 300, h = height, w = width;

  const ys = data.map((d) => d.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rangeY = maxY - minY || 1;
  const stepX = w / Math.max(1, data.length - 1);

  const points = data
    .map((d, i) => {
      const x = i * stepX;
      const normY = (d.y - minY) / rangeY;
      const y = h - normY * (h - 6) - 3;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const lastX = (data.length - 1) * stepX;
  const areaPath = `M 0,${h} L ${points.replace(/ /g, " L ")} L ${lastX},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true">
      <path d={areaPath} fill={fill} />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
};

/** Format Date -> YYYY-MM-DD */
const ymd = (d) => {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const dd = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Profile
  const [profile, setProfile] = useState(null);

  // Widgets state
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobsTotal, setJobsTotal] = useState(null);

  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [headlines, setHeadlines] = useState([]);

  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState("");
  const [trendSeries, setTrendSeries] = useState([]);

  // Account dropdown
  const [acctOpen, setAcctOpen] = useState(false);
  const acctRef = useRef(null);

  // Defaults
  const JOB_QUERY = "data analyst";
  const JOB_LOCATION = "remote";
  const PAGE_SIZE = 50;

  const isActive = (path) => location.pathname.startsWith(path);

  // Profile fetch
  useEffect(() => {
    let aborted = false;
    (async () => {
      try {
        const token = localStorage.getItem("token") || "";
        if (!token) {
          if (!aborted) setProfile(null);
          return;
        }
        const res = await fetch(`${API_BASE}/api/v1/profile/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (aborted) return;
        if (res.ok) setProfile(await res.json());
        else if (res.status === 401) {
          localStorage.removeItem("token");
          setProfile(null);
        } else setProfile(null);
      } catch {
        if (!aborted) setProfile(null);
      }
    })();
    return () => { aborted = true; };
  }, []);

  // Outside click + ESC to close account dropdown
  useEffect(() => {
    const onDown = (e) => {
      if (acctRef.current && !acctRef.current.contains(e.target)) setAcctOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setAcctOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Jobs
  useEffect(() => {
    let isMounted = true;
    (async () => {
      setJobsLoading(true); setJobsError("");
      try {
        const u = new URL(`${API_BASE}/api/v1/jobs/search`);
        u.searchParams.set("q", JOB_QUERY);
        u.searchParams.set("location", JOB_LOCATION);
        u.searchParams.set("page", "1");
        u.searchParams.set("page_size", String(PAGE_SIZE));
        const res = await fetch(u.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!isMounted) return;
        const items = Array.isArray(data?.items) ? data.items : [];
        setJobs(items);
        setJobsTotal(typeof data?.total === "number" ? data.total : items.length);
      } catch (e) {
        if (isMounted) setJobsError(String(e?.message || e));
      } finally {
        if (isMounted) setJobsLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // News
  useEffect(() => {
    let ok = true;
    (async () => {
      setNewsLoading(true); setNewsError("");
      try {
        const res = await fetch(
          `${API_BASE}/api/v1/news/jobs?limit=6&q=job|hiring|recruit|opening|career&strict=true`
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (ok) setHeadlines(Array.isArray(data?.items) ? data.items : []);
      } catch (e) {
        if (ok) setNewsError(String(e?.message || e));
      } finally {
        if (ok) setNewsLoading(false);
      }
    })();
    return () => { ok = false; };
  }, []);

  // Trends (with fallback aggregation)
  useEffect(() => {
    let alive = true;

    const aggregateFromJobs = async () => {
      try {
        const u = new URL(`${API_BASE}/api/v1/jobs/search`);
        u.searchParams.set("q", JOB_QUERY);
        u.searchParams.set("location", JOB_LOCATION);
        u.searchParams.set("page", "1");
        u.searchParams.set("page_size", "200");
        u.searchParams.set("days", "30");
        u.searchParams.set("sort", "date_desc");
        const res = await fetch(u.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        const items = Array.isArray(data?.items) ? data.items : [];
        const map = new Map(); // yyyy-mm-dd -> count

        const end = new Date();
        const start = new Date(); start.setDate(end.getDate() - 29);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          map.set(ymd(d), 0);
        }

        const fields = ["posted_at", "published_at", "created_at", "date"];
        for (const it of items) {
          let raw = null;
          for (const f of fields) { if (it?.[f]) { raw = it[f]; break; } }
          if (!raw) continue;
          const dt = new Date(raw);
          if (isNaN(dt)) continue;
          const key = ymd(dt);
          if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
        }

        const series = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const key = ymd(d);
          series.push({ date: key, count: map.get(key) || 0 });
        }

        if (alive) { setTrendSeries(series); setTrendError(""); }
      } catch (e) {
        if (alive) setTrendError(String(e?.message || e));
      } finally {
        if (alive) setTrendLoading(false);
      }
    };

    const loadTrends = async () => {
      setTrendLoading(true); setTrendError("");
      try {
        const u = new URL(`${API_BASE}/api/v1/jobs/trends`);
        u.searchParams.set("days", "30");
        u.searchParams.set("q", JOB_QUERY);
        u.searchParams.set("location", JOB_LOCATION);
        const res = await fetch(u.toString());
        if (!res.ok) {
          if (res.status === 404) { await aggregateFromJobs(); return; }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        items.sort((a, b) => new Date(a.date) - new Date(b.date));
        if (alive) { setTrendSeries(items); setTrendLoading(false); }
      } catch {
        await aggregateFromJobs();
      }
    };

    loadTrends();
    return () => { alive = false; };
  }, []);

  // Companies
  const topCompanies = useMemo(() => {
    const map = new Map();
    for (const j of jobs) {
      const name = j?.company || j?.company_name || j?.employer_name || j?.organization || "Unknown";
      map.set(name, (map.get(name) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([company, count]) => ({ company, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [jobs]);

  const initials = (() => {
    const name = profile?.full_name || "";
    if (!name.trim()) return "👤";
    return name.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() || "").join("").slice(0, 3) || "👤";
  })();

  const firstName = (() => {
    const name = profile?.full_name || profile?.email || "";
    if (!name) return "there";
    return String(name).split(/[ ,@]/)[0];
  })();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const goProfile = () => { navigate("/profile"); };
  const signOut = () => {
    if (window.confirm("Sign out of TalentHireAI?")) {
      localStorage.removeItem("token"); setProfile(null); navigate("/login");
    }
  };

  // styles
  const small = { fontSize: 12, color: "#6b7280" };
  const big = { fontSize: 36, fontWeight: 700, lineHeight: 1.1 };
  const listItem = {
    display: "flex", alignItems: "center", gap: 10,
    border: "1px solid #f1f5f9", borderRadius: 10,
    padding: "8px 12px", background: "#fff",
  };
  const linkIcon = { fontSize: 14, color: "#64748b", marginLeft: "auto", paddingLeft: 8, textDecoration: "none" };

  const trendStart = trendSeries[0]?.date;
  const trendEnd = trendSeries[trendSeries.length - 1]?.date;

  return (
    <>
      <style>
        {`
        * { box-sizing: border-box; }
        html, body, #root { height: 100%; overflow-x: hidden; }
        body { margin: 0; padding: 0; font-family: sans-serif; background: #f6f8fb; }

        nav.dashboard-sidebar {
          position: fixed; top: 0; left: 0; height: 100vh; width: 220px;
          background-color: #1f3b4d; color: #fff; padding: 20px;
          display: flex; flex-direction: column; justify-content: flex-start;
          box-shadow: 2px 0 8px rgba(0,0,0,0.1); z-index: 1000;
          gap: 16px;
        }
        .sidebar-top { display: flex; flex-direction: column; gap: 20px; }
        nav.dashboard-sidebar h2 { margin: 0 0 10px 0; font-size: 1.2rem; }

        /* Sidebar nav buttons */
        nav.dashboard-sidebar button.nav-btn {
          display: flex; align-items: center; gap: 12px;
          border: none; padding: 10px 20px; border-radius: 30px;
          font-weight: 600; font-size: 1rem; cursor: pointer;
          transition: transform .05s, box-shadow .12s, filter .12s;
          text-align: left; color: #0f172a;
          box-shadow: 0 4px 14px rgba(15,23,42,.08);
        }
        nav.dashboard-sidebar button.nav-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 22px rgba(15,23,42,.12);
          filter: saturate(1.04);
        }

        /* Account block with dropdown */
        .account {
          position: relative;
          margin-top: auto;         /* push near bottom */
          margin-bottom: 28px;      /* lift up from edge */
          padding-top: 8px;
          border-top: 1px dashed rgba(255,255,255,.15);
        }
        .acct-row {
          display: grid;
          grid-template-columns: 40px 1fr 18px;
          align-items: center;
          gap: 10px;
        }
        .avatar-btn {
          width: 40px; height: 40px; border-radius: 50%;
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.25);
          color: #fff; font-weight: 700; cursor: pointer;
        }
        .acct-info { overflow: hidden; }
        .acct-name { font-size: 12px; font-weight: 700; color: #fff; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
        .acct-email { font-size: 11px; color: rgba(255,255,255,.75); white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }
        .acct-caret { color: rgba(255,255,255,.8); font-size: 14px; user-select: none; }

        .acct-pop {
          position: absolute;
          left: 0;
          bottom: calc(100% + 10px);   /* open above the block */
          width: 200px;
          background: #fff; color: #0f172a;
          border: 1px solid #e5e7eb; border-radius: 12px;
          box-shadow: 0 12px 28px rgba(15,23,42,.18);
          overflow: hidden; z-index: 2000;
        }
        .acct-pop:after {
          content: "";
          position: absolute;
          left: 18px; bottom: -8px;
          width: 12px; height: 12px;
          background: #fff;
          border-left: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
          transform: rotate(45deg);
        }
        .pop-item {
          width: 100%; padding: 10px 14px; background: #fff; border: 0;
          display: flex; align-items: center; gap: 10px; text-align: left; cursor: pointer;
          font-size: .95rem;
          transition: background-color .12s ease;
        }
        .pop-item:hover { background: #f5f7fb; }
        .pop-sep { border-top: 1px solid #eef0f3; margin: 4px 0; }
        .danger { color: #b91c1c; }

        /* Main layout */
        main.dashboard-main {
          margin-left: 220px;
          padding: 32px 32px 48px;
          width: calc(100% - 220px);
          max-width: calc(100% - 220px);
        }
        .content-wrap { display: block; }

        .right-rail {
          width: 100%;
          max-width: 1200px;
          margin-left: 0;
          display: flex; flex-direction: column; gap: 16px;
        }

        .card {
          border-radius: 16px; border: 1px solid #e5e7eb; background: #fff;
          padding: 16px; box-shadow: 0 6px 20px rgba(15,23,42,.06);
        }

        /* Welcome hero */
        .welcome-hero {
          border-radius: 18px; border: 1px solid #e5e7eb;
          background: linear-gradient(135deg, #eaf3ff 0%, #ffffff 45%, #ffeef2 100%);
          padding: 18px 20px; box-shadow: 0 10px 28px rgba(15,23,42,.08);
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }
        .welcome-title { font-size: 20px; font-weight: 800; color: #0f172a; }
        .welcome-sub { font-size: 13px; color: #64748b; margin-top: 4px; }
        .welcome-cta {
          border: 1px solid #e5e7eb; background: #fff; padding: 8px 12px;
          border-radius: 9999px; font-size: 13px; color: #0f172a; cursor: pointer;
          box-shadow: 0 4px 14px rgba(15,23,42,.06);
        }
        .welcome-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(15,23,42,.1); }

        /* News grid */
        .news-grid {
          display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px; margin-top: 8px;
        }
        @media (max-width: 1400px) { .news-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        @media (max-width: 1024px) { .news-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 640px)  { .news-grid { grid-template-columns: 1fr; } }

        .news-card {
          display: block; border: 1px solid #e5e7eb; border-radius: 12px;
          background: #fff; padding: 10px; text-decoration: none; color: #111827;
          box-shadow: 0 4px 14px rgba(15,23,42,.05);
          transition: transform .06s, box-shadow .12s;
        }
        .news-card:hover { transform: translateY(-1px); box-shadow: 0 8px 22px rgba(15,23,42,.08); }
        .news-thumb { width: 100%; height: 136px; border-radius: 8px; object-fit: cover; border: 1px solid #e5e7eb; background: #f1f5f9; display: block; }
        .news-title { margin: 10px 2px 0; font-size: 14px; line-height: 1.25; color: #1f2937; }
        .news-meta { margin: 6px 2px 0; font-size: 12px; color: #6b7280; }
      `}
      </style>

      <nav className="dashboard-sidebar" aria-label="Dashboard navigation">
        <div className="sidebar-top">
          <h2>✨TalentHireAI</h2>

          <button className="nav-btn" onClick={() => navigate("/resume-matcher")}
            style={{ backgroundImage: "linear-gradient(0deg, #fff 10%, #e0ecf4 100%)" }}>
            📄 Resume Matcher
          </button>
          <button className="nav-btn" onClick={() => navigate("/resume-cover-generator")}
            style={{ backgroundImage: "linear-gradient(0deg, #fff 10%, #e8f7ee 100%)" }}>
            ✍️ Resume & Cover Generator
          </button>
          <button className="nav-btn" onClick={() => navigate("/my-resumes")}
            style={{ backgroundImage: "linear-gradient(0deg, #fff 10%, #f8f1ff 100%)" }}>
            📁 My Resumes
          </button>
          <button className="nav-btn" onClick={() => navigate("/interview-prep")}
            style={{ backgroundImage: "linear-gradient(0deg, #fff 10%, #fff4e5 100%)" }}>
            🗣️ Interview Prep
          </button>
          <button className="nav-btn" onClick={() => navigate("/mockmate")}
            style={{ backgroundImage: "linear-gradient(0deg, #fff 10%, #eaf3ff 100%)" }}>
            🤖 MockMate
          </button>
          <button className="nav-btn" onClick={() => navigate("/dashboard/jobs")}
            style={{ backgroundImage: "linear-gradient(0deg, #fff 10%, #ffeef2 100%)" }}>
            💼 Job Postings
          </button>
        </div>

        {/* Account block with avatar dropdown */}
        <div className="account" ref={acctRef}>
          <div className="acct-row">
            <button
              className="avatar-btn"
              title={profile?.full_name || "User"}
              aria-haspopup="menu"
              aria-expanded={acctOpen}
              onClick={() => setAcctOpen((v) => !v)}
            >
              {initials}
            </button>
            <div className="acct-info">
              <div className="acct-name">{profile?.full_name || "Guest"}</div>
              {profile?.email ? <div className="acct-email">{profile.email}</div> : null}
            </div>
            <div className="acct-caret">▾</div>
          </div>

          {acctOpen && (
            <div className="acct-pop" role="menu" aria-label="Account menu">
              <button className="pop-item" role="menuitem" onClick={() => { setAcctOpen(false); navigate("/profile"); }}>
                <span>👤</span><span>My Profile</span>
              </button>
              <div className="pop-sep" />
              <button className="pop-item danger" role="menuitem" onClick={() => { setAcctOpen(false); signOut(); }}>
                <span>↩︎</span><span>Sign out</span>
              </button>
            </div>
          )}
        </div>
      </nav>

      <main className="dashboard-main">
        <div className="content-wrap">
          <aside className="right-rail" aria-label="Main widgets">
            {/* Welcome banner */}
            <div className="welcome-hero">
              <div>
                <div className="welcome-title">
                  {`${greeting}, ${firstName?.toUpperCase?.() || "THERE"}! Welcome to Job Flow AI 👋`}
                </div>
                <div className="welcome-sub">
                  {profile
                    ? "Let’s find great roles and sharpen your applications today."
                    : "Sign in to personalize your dashboard and save progress."}
                </div>
              </div>
              <button className="welcome-cta" onClick={() => navigate(profile ? "/dashboard/jobs" : "/login")}>
                {profile ? "Find Jobs →" : "Sign In →"}
              </button>
            </div>

            {/* Job Trends */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Job Trends (30 days)</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {trendStart && trendEnd ? `${shortDate(trendStart)} – ${shortDate(trendEnd)}` : null}
                </div>
              </div>

              {trendLoading && <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 8 }}>Loading…</div>}
              {trendError && trendSeries.length === 0 && (
                <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>No trend data available.</div>
              )}
              {!trendLoading && trendSeries.length > 0 && (
                <>
                  <Sparkline data={trendSeries.map((d, i) => ({ x: i, y: Number(d.count) || 0 }))} height={64} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280" }}>
                    <span>{shortDate(trendStart)}</span>
                    <span>{shortDate(trendEnd)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Today’s New Jobs */}
            <div className="card">
              <div style={small}>Today’s New Jobs</div>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6 }}>
                <div style={big}>{jobsLoading ? "…" : (jobsTotal ?? "—")}</div>
                <div style={{ color: "#94a3b8", fontSize: 18 }}>🔎</div>
              </div>
              {jobsError ? (
                <div style={{ marginTop: 6, color: "#dc2626", fontSize: 12 }}>Error: {jobsError}</div>
              ) : null}
              <div style={{ marginTop: 4, ...small }}>
                Query: <strong>{JOB_QUERY}</strong> · Location: <strong>{JOB_LOCATION}</strong>
              </div>
            </div>

            {/* Top Hiring Companies */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={small}>Top Hiring Companies</div>
                <span style={{ color: "#94a3b8" }}>🏢</span>
              </div>
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {jobsLoading && topCompanies.length === 0 ? (
                  <div style={{ color: "#94a3b8", fontSize: 14 }}>Loading…</div>
                ) : topCompanies.length > 0 ? (
                  topCompanies.map((c) => {
                    const careersUrl = `https://www.google.com/search?q=${encodeURIComponent(`${c.company} careers jobs`)}`;
                    return (
                      <div
                        key={c.company}
                        role="button"
                        tabIndex={0}
                        title={`View jobs at ${c.company}`}
                        onClick={() => navigate(`/dashboard/jobs?company=${encodeURIComponent(c.company)}`)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/dashboard/jobs?company=${encodeURIComponent(c.company)}`); } }}
                        style={{ ...listItem, cursor: "pointer" }}
                      >
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 8, color: "#111827" }}>
                          {c.company}
                        </span>
                        <span style={{ fontSize: 12, color: "#6b7280" }}>{c.count}</span>
                        <a href={careersUrl} target="_blank" rel="noreferrer" aria-label={`Search ${c.company} careers`} style={linkIcon} onClick={(e) => e.stopPropagation()}>
                          ↗
                        </a>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ color: "#94a3b8", fontSize: 14 }}>No companies found.</div>
                )}
              </div>
            </div>

            {/* Job News Headlines */}
            <div className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ ...small }}>Job News Headlines</div>
                <span style={{ color: "#94a3b8" }}>📰</span>
              </div>

              {newsLoading && <div style={{ color: "#94a3b8", fontSize: 14, marginTop: 8 }}>Loading…</div>}
              {newsError && <div style={{ color: "#dc2626", fontSize: 12, marginTop: 8 }}>Error: {newsError}</div>}

              {!newsLoading && !newsError && (
                <div className="news-grid">
                  {headlines.map((h, i) => {
                    const hasImage = Boolean(h?.image);
                    const host = (() => { try { return new URL(h.url).host.replace(/^www\./, ""); } catch { return ""; } })();
                    return (
                      <a key={`${h.url || i}`} className="news-card" href={h.url} target="_blank" rel="noreferrer" title={h.source ? `Source: ${h.source}` : undefined}>
                        {hasImage
                          ? <img className="news-thumb" src={h.image} alt="" loading="lazy" />
                          : <div className="news-thumb" aria-hidden="true" style={{ display: "grid", placeItems: "center", color: "#94a3b8", fontSize: 22 }}>📰</div>
                        }
                        <div className="news-title">{h.title}</div>
                        <div className="news-meta">{host || h.source || ""}</div>
                      </a>
                    );
                  })}
                  {headlines.length === 0 && <div style={{ color: "#94a3b8", paddingLeft: 4 }}>No headlines available.</div>}
                </div>
              )}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
};

export default DashboardPage;
