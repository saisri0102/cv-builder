import { useEffect, useState } from "react";

type Status = {
  plan_key: "free" | "pro_month" | "pro_year";
  subscription_status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "free";
  current_period_end?: string | null;
};

export default function SubscriptionBadge() {
  const [data, setData] = useState<Status | null>(null);

  useEffect(() => {
    const token = (typeof window !== "undefined" && localStorage.getItem("token")) || "";
    if (!token) return;

    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/v1/pay/status", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const json: Status = await res.json();
        if (alive) setData(json);
      } catch {
        if (alive) setData(null);
      }
    })();

    return () => {
      alive = false;
    };
  }, []); // read token once on mount

  if (!data) return null;

  const pro = data.subscription_status === "active" || data.subscription_status === "trialing";
  const end = data.current_period_end ? new Date(data.current_period_end).toLocaleDateString() : undefined;

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
      pro ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"
    }`}>
      {pro ? (data.plan_key === "pro_year" ? "Pro (Yearly)" : "Pro (Monthly)") : "Free"}
      {pro && end ? <span className="opacity-70">• Renews {end}</span> : null}
    </div>
  );
}
