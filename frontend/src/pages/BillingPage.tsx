// frontend/src/pages/BillingPage.tsx
// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";

type Status = {
  plan_key: "free" | "pro_month" | "pro_year";
  subscription_status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "free";
  current_period_end?: string | null;
};

/** ---------------- API base (CRA first, then Vite), default FastAPI ---------------- */
const RAW =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_API_BASE) ||
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  "http://127.0.0.1:8000";
const API_BASE = String(RAW).replace(/\/+$/, "");

/** ---------------- Auth helpers ---------------- */
function getToken() {
  return localStorage.getItem("access_token") || localStorage.getItem("token") || "";
}
function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}
async function postJSON(url: string, body?: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.detail || r.statusText);
  return data;
}

/** ---------------- Page ---------------- */
export default function BillingPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState<"mo" | "yr" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isPro =
    status?.subscription_status === "active" || status?.subscription_status === "trialing";
  const renew = useMemo(
    () => (status?.current_period_end ? new Date(status.current_period_end).toLocaleDateString() : null),
    [status?.current_period_end]
  );

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const success = params.get("status") === "success";
  const cancelled = params.get("status") === "cancelled";

  /** Fetch current subscription status */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/pay/status`, { headers: { ...authHeaders() } });
        const data = await r.json();
        if (!r.ok) throw new Error(data?.detail || r.statusText);
        setStatus(data);
      } catch (e) {
        console.warn("Status fetch failed:", e);
        setStatus(null);
      }
    })();
  }, []);

  /** Actions */
  async function upgrade(plan: "pro_month" | "pro_year") {
    try {
      setError(null);
      setLoading(plan === "pro_month" ? "mo" : "yr");
      const { url } = await postJSON(`${API_BASE}/api/v1/pay/checkout-session`, { plan });
      window.location.href = url; // Stripe Checkout
    } catch (e: any) {
      setError(e.message || "Could not start checkout");
      setLoading(null);
    }
  }
  async function openPortal() {
    try {
      setError(null);
      setLoading("portal");
      const r = await fetch(`${API_BASE}/api/v1/pay/portal`, { headers: { ...authHeaders() } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.detail || r.statusText);
      window.location.href = data.url; // Stripe Customer Portal
    } catch (e: any) {
      setError(e.message || "Billing portal unavailable");
      setLoading(null);
    }
  }

  return (
    <div className="billing">
      {/* scoped styles */}
      <style>{`
        .billing {
          --bg: #0b1020;
          --card: #0f172a;
          --muted: #64748b;
          --ring: rgba(99,102,241,.35);
          --brand: #111827;
          --brand-2: #4f46e5;
          --accent: #22c55e;
          --border: rgba(255,255,255,.08);
          max-width: 1100px;
          margin: 0 auto;
          padding: 32px 20px 80px;
          color: #0f172a;
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        }
        .hero {
          position: relative;
          background: linear-gradient(120deg, #f8fafc 0%, #eef2ff 60%, #e0e7ff 100%);
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          padding: 22px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          overflow: hidden;
        }
        .hero::after{
          content:"";
          position:absolute;
          inset:-1px;
          background: radial-gradient(600px 120px at 100% -10%, rgba(79,70,229,.15), transparent 60%);
          pointer-events:none;
        }
        .hero h1 { margin: 0 0 6px; font-size: 28px; }
        .muted { color: #6b7280; font-size: 14px; margin:0; }

        .alert {
          margin-top: 12px; padding: 12px; border-radius: 12px; font-size: 14px; font-weight: 600;
          border: 1px solid; display: flex; align-items: center; gap: 8px;
        }
        .alert.success { color: #065f46; background: #ecfdf5; border-color: #34d399; }
        .alert.warn { color: #92400e; background: #fffbeb; border-color: #f59e0b; }

        .plan-badge {
          display:inline-flex; align-items:center; gap:10px;
          padding:8px 12px; border-radius:999px; font-weight:700; font-size:12px;
          border:1px solid #e5e7eb; background:#fff;
        }
        .dot { width:8px; height:8px; border-radius:999px; background:#6b7280; }
        .dot.pro { background:#059669; }

        .grid {
          margin-top: 24px;
          display:grid;
          gap:18px;
          grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
        }

        .card {
          position:relative;
          border-radius:18px;
          padding:22px;
          background:
            linear-gradient(#fff,#fff) padding-box,
            linear-gradient(120deg, rgba(79,70,229,.35), rgba(34,197,94,.25)) border-box;
          border: 1px solid transparent;
          box-shadow: 0 10px 18px rgba(2,6,23,.04);
          transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
        }
        .card:hover { transform: translateY(-2px); box-shadow: 0 18px 40px rgba(2,6,23,.08); }
        .card.popular { box-shadow: 0 18px 50px rgba(79,70,229,.12); border-image: linear-gradient(120deg, rgba(79,70,229,.6), rgba(99,102,241,.35)) 1; }
        .ribbon { position:absolute; top:14px; right:14px; background:#eef2ff; color:#4338ca; border:1px solid #c7d2fe; padding:4px 10px; border-radius:999px; font-size:11px; font-weight:700; }

        .price { font-size: 36px; font-weight: 800; letter-spacing: -.02em; margin: 2px 0; }
        .per { color:#6b7280; font-size: 14px; margin-left: 6px; }

        .list { margin: 8px 0 0; padding: 0; list-style:none; display:grid; gap:10px; }
        .item { display:flex; align-items:center; gap:10px; color:#111827; font-size:14px; }
        .check { width:18px; height:18px; color: var(--accent); }

        .cta {
          display:inline-flex; align-items:center; justify-content:center;
          gap:8px; padding:10px 14px; border-radius:12px; font-weight:700;
          border:1px solid #111827; background:#111827; color:#fff; cursor:pointer;
          transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
        }
        .cta:hover { transform: translateY(-1px); box-shadow:0 10px 18px rgba(17,24,39,.18); }
        .cta.secondary { background:#fff; color:#111827; border:1px solid #e5e7eb; box-shadow:none; }
        .note { color:#6b7280; font-size:12px; margin-top:8px; }

        .error { margin-top:16px; padding:12px; border-radius:12px; border:1px solid #fecaca; background:#fff1f2; color:#991b1b; font-size:14px; }

        .section { margin-top: 28px; border-top:1px solid #e5e7eb; padding-top:20px; }
        .section h3 { margin:0 0 6px; font-size:18px; }
        .faq { color:#6b7280; font-size:14px; }
        .secure { display:flex; align-items:center; gap:8px; color:#64748b; font-size:12px; }
        .lock { width:14px; height:14px; }
      `}</style>

      {/* HERO */}
      <div className="hero">
        <div>
          <h1>Billing &amp; Plan</h1>
          <p className="muted">Manage your subscription, upgrade anytime, and access your invoices.</p>
        </div>
        <div className="plan-badge">
          <span className={`dot ${isPro ? "pro" : ""}`} />
          {isPro
            ? status?.plan_key === "pro_year"
              ? "Pro (Yearly)"
              : "Pro (Monthly)"
            : "Free"}
          {renew ? <span style={{ color: "#6b7280", fontWeight: 600 }}>• Renews {renew}</span> : null}
        </div>
      </div>

      {/* Stripe result notices */}
      {success && <div className="alert success">✅ Payment successful (test). Welcome to Pro!</div>}
      {cancelled && <div className="alert warn">⚠️ Checkout cancelled.</div>}

      {isPro && (
        <div style={{ marginTop: 12, color: "#065f46", fontSize: 13, fontWeight: 600 }}>
          ✓ Your subscription is active{renew ? ` — next renewal ${renew}` : ""}.
        </div>
      )}
      {error && <div className="error">{error}</div>}

      {/* PLANS */}
      <div className="grid">
        {/* Monthly */}
        <div className="card">
          <div style={{ fontWeight: 800, fontSize: 16 }}>Plus — Monthly</div>
          <div>
            <span className="price">$9.99</span>
            <span className="per">/ month</span>
          </div>

          <ul className="list">
            <li className="item">{CheckIcon()} Unlimited resume enhancements</li>
            <li className="item">{CheckIcon()} Smart job matching</li>
            <li className="item">{CheckIcon()} AI interview prep</li>
            <li className="item">{CheckIcon()} Priority support</li>
          </ul>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={() => upgrade("pro_month")} disabled={loading !== null} className="cta">
              {loading === "mo"
                ? "Starting…"
                : isPro && status?.plan_key === "pro_month"
                ? "Current plan"
                : "Upgrade"}
            </button>
          </div>

          <div className="note">
            Cancel anytime. Sandbox test card: <code>4242 4242 4242 4242</code>
          </div>
        </div>

        {/* Yearly */}
        <div className="card popular">
          <div className="ribbon">Save 33%</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Pro — Yearly</div>
          <div>
            <span className="price">$79.99</span>
            <span className="per">/ year</span>
          </div>

          <ul className="list">
            <li className="item">{CheckIcon()} Everything in Plus</li>
            <li className="item">{CheckIcon()} Advanced analytics</li>
            <li className="item">{CheckIcon()} Early feature access</li>
            <li className="item">{CheckIcon()} Dedicated support</li>
          </ul>

          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button onClick={() => upgrade("pro_year")} disabled={loading !== null} className="cta">
              {loading === "yr"
                ? "Starting…"
                : isPro && status?.plan_key === "pro_year"
                ? "Current plan"
                : "Upgrade"}
            </button>
          </div>

          <div className="note">Billed annually. Cancel anytime in the portal.</div>
        </div>
      </div>

      {/* PORTAL + TRUST */}
      <div style={{ marginTop: 22, display: "flex", alignItems: "center", gap: 14 }}>
        <button onClick={openPortal} disabled={loading !== null} className="cta secondary">
          {loading === "portal" ? "Opening…" : "Manage billing (portal)"}
        </button>
        <div className="secure">
          {LockIcon()} Payments are processed securely by Stripe.
        </div>
      </div>

      {/* FAQ */}
      <div className="section">
        <h3>FAQ</h3>
        <div className="faq">
          <p>
            <b>How do I test payments?</b> Use card <code>4242 4242 4242 4242</code>, any future expiry, any CVC/ZIP.
          </p>
          <p>
            <b>Where are invoices and cancellations?</b> Click <b>Manage billing (portal)</b> to access the Stripe Customer Portal.
          </p>
        </div>
      </div>
    </div>
  );
}

/** ---------------- Icons ---------------- */
function CheckIcon() {
  return (
    <svg className="check" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path d="M7.5 13.5 3.5 9.5 2 11l5.5 5.5L18 6 16.5 4.5z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 1 1 8 0v4" />
    </svg>
  );
}
