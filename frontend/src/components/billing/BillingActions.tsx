// BillingActions.tsx
export function UpgradeButtons() {
    const token = localStorage.getItem("token");
  
    async function startCheckout(plan: "pro_month" | "pro_year") {
      const r = await fetch("/api/v1/pay/checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plan }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(`Checkout failed: ${err.detail || r.statusText}`);
        return;
      }
      const { url } = await r.json();
      window.location.href = url;
    }
  
    return (
      <div className="flex gap-2">
        <button onClick={() => startCheckout("pro_month")} className="px-4 py-2 rounded bg-black text-white">
          Upgrade — $9.99/mo
        </button>
        <button onClick={() => startCheckout("pro_year")} className="px-4 py-2 rounded border">
          Upgrade — $79.99/yr
        </button>
      </div>
    );
  }
  
  export function ManageBillingButton() {
    const token = localStorage.getItem("token");
  
    async function openPortal() {
      const r = await fetch("/api/v1/pay/portal", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(`Portal error: ${err.detail || r.statusText}`);
        return;
      }
      const { url } = await r.json();
      window.location.href = url;
    }
  
    return (
      <button onClick={openPortal} className="px-4 py-2 rounded border">
        Manage billing
      </button>
    );
  }
  