// src/components/RightJobsWidgets.jsx
import React, { useEffect, useMemo, useState } from "react";

/** ---- Resolve API base (Vite or CRA), ends like http://host:port/api/v1 ---- */
const RAW =
  (typeof import.meta !== "undefined" && import.meta.env && (import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_BASE)) ||
  (typeof process !== "undefined" && process.env && (process.env.REACT_APP_API_BASE_URL || process.env.REACT_APP_API_BASE)) ||
  "http://127.0.0.1:8000";
const API_BASE = String(RAW).replace(/\/+$/, "") + "/api/v1";

/** ---- Super-simple, job-focused right-side widgets ---- */
export default function RightJobsWidgets({
  // You can pass defaults from the parent page if you want
  query = "data analyst",
  location = "remote",
  pageSize = 50,
  // Optional: override headlines from parent or keep the defaults below
  headlines = [
    { title: "Tech hiring picks up in data roles", url: "#" },
    { title: "Remote job listings stabilize this month", url: "#" },
    { title: "Cloud & AI skills drive salary premiums", url: "#" },
  ],
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [total, setTotal] = useState(null);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    let isMounted = true;
    async function fetchJobs() {
      setLoading(true);
      setErr("");
      try {
        // Adjust querystring keys to match your backend if different
        const u = new URL(`${API_BASE}/jobs/search`);
        u.searchParams.set("q", query);
        u.searchParams.set("location", location);
        u.searchParams.set("page", "1");
        u.searchParams.set("page_size", String(pageSize));

        const res = await fetch(u.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Expected shape: { items: [...], total: number }
        if (isMounted) {
          setJobs(Array.isArray(data?.items) ? data.items : []);
          setTotal(typeof data?.total === "number" ? data.total : (data?.items?.length || 0));
        }
      } catch (e) {
        if (isMounted) setErr(String(e?.message || e));
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    fetchJobs();
    return () => { isMounted = false; };
  }, [query, location, pageSize]);

  // Top hiring companies from the fetched jobs (client-side count)
  const topCompanies = useMemo(() => {
    const map = new Map();
    for (const j of jobs) {
      const name =
        j?.company ||
        j?.company_name ||
        j?.employer_name ||
        j?.organization ||
        "Unknown";
      map.set(name, (map.get(name) || 0) + 1);
    }
    const arr = Array.from(map.entries()).map(([company, count]) => ({ company, count }));
    arr.sort((a, b) => b.count - a.count);
    return arr.slice(0, 6);
  }, [jobs]);

  return (
    <aside className="w-full xl:w-80 2xl:w-96 space-y-4">
      {/* Card: Today's New Jobs */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-sm text-slate-500">Today’s New Jobs</div>
        <div className="mt-2 flex items-end justify-between">
          <div className="text-4xl font-semibold tracking-tight">
            {loading ? "…" : (total ?? "—")}
          </div>
          <div className="text-slate-400 text-lg">🔎</div>
        </div>
        {err ? <div className="mt-2 text-xs text-red-500">Error: {err}</div> : null}
        <div className="mt-1 text-xs text-slate-500">
          Query: <span className="font-medium">{query}</span> · Location: <span className="font-medium">{location}</span>
        </div>
      </div>

      {/* Card: Top Hiring Companies */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">Top Hiring Companies</div>
          <span className="text-slate-400">🏢</span>
        </div>

        <ul className="mt-3 space-y-2">
          {loading && topCompanies.length === 0 ? (
            <li className="text-slate-400 text-sm">Loading…</li>
          ) : topCompanies.length > 0 ? (
            topCompanies.map((c) => (
              <li
                key={c.company}
                className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
              >
                <span className="truncate pr-2">{c.company}</span>
                <span className="text-xs text-slate-500">{c.count}</span>
              </li>
            ))
          ) : (
            <li className="text-slate-400 text-sm">No companies found.</li>
          )}
        </ul>
      </div>

      {/* Card: Job News Headlines (static, simple links) */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">Job News Headlines</div>
          <span className="text-slate-400">📰</span>
        </div>
        <ul className="mt-3 space-y-2">
          {headlines.map((h, i) => (
            <li key={i}>
              <a
                href={h.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-slate-700 hover:text-blue-600 hover:underline"
              >
                • {h.title}
              </a>
            </li>
          ))}
        </ul>
        {/* Tip: later, you can replace the static list with your own backend RSS proxy */}
      </div>
    </aside>
  );
}
