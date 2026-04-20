# backend/routes/payments.py
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime
import os
import stripe

from backend.deps import get_db, get_current_user
from backend.models import User

router = APIRouter(prefix="/api/v1/pay", tags=["payments"])

# ---- Env / config ----
stripe.api_key = os.getenv("STRIPE_SECRET_KEY") or ""
PRICE_MONTH = os.getenv("STRIPE_PRICE_PRO_MONTH") or ""
PRICE_YEAR  = os.getenv("STRIPE_PRICE_PRO_YEAR") or ""
APP_BASE    = os.getenv("APP_BASE_URL", "http://localhost:3000")
WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET") or ""

def _require_env():
    missing = []
    if not stripe.api_key or not stripe.api_key.startswith(("sk_", "rk_")):
        missing.append("STRIPE_SECRET_KEY")
    if not PRICE_MONTH:
        missing.append("STRIPE_PRICE_PRO_MONTH")
    if not PRICE_YEAR:
        missing.append("STRIPE_PRICE_PRO_YEAR")
    if missing:
        raise HTTPException(status_code=500, detail=f"Server misconfig: missing env {', '.join(missing)}")

# ---- Helpers ----
def ensure_customer(user: User) -> str:
    """Create or return the Stripe Customer for this user."""
    if user.stripe_customer_id:
        return user.stripe_customer_id
    c = stripe.Customer.create(email=user.email, metadata={"user_id": str(user.id)})
    user.stripe_customer_id = c.id
    return c.id

def _ts_to_dt(ts: int | None):
    """Convert unix ts -> naive UTC datetime (matches your DB DateTime column)."""
    return datetime.utcfromtimestamp(ts) if ts else None

def _get_item_period_end(sub: dict) -> int | None:
    """Stripe (newer API) exposes current_period_end on subscription items."""
    items = (sub.get("items") or {}).get("data") or []
    for it in items:
        end_ts = it.get("current_period_end")
        if end_ts:
            return end_ts
    return None

def _apply_subscription_to_user(user: User, sub: dict, db: Session):
    # status
    user.subscription_status = sub.get("status") or "free"

    # plan interval -> plan_key
    items = (sub.get("items") or {}).get("data", [])
    interval = None
    for it in items:
        try:
            interval = it["price"]["recurring"]["interval"]
            break
        except Exception:
            continue
    user.plan_key = "pro_month" if interval == "month" else ("pro_year" if interval == "year" else "free")

    # current period end (from item-level field)
    end_ts = _get_item_period_end(sub)
    user.subscription_current_period_end = _ts_to_dt(end_ts)

    db.add(user); db.commit()

# ---- Routes ----
@router.post("/checkout-session")
def create_checkout_session(
    payload: dict,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Body: {"plan": "pro_month" | "pro_year"}
    Returns: {"url": "https://checkout.stripe.com/..."}
    """
    _require_env()

    plan = (payload or {}).get("plan")
    price_id = PRICE_MONTH if plan == "pro_month" else PRICE_YEAR if plan == "pro_year" else None
    if not price_id:
        raise HTTPException(status_code=400, detail="Invalid plan")

    try:
        cid = ensure_customer(user)
        db.add(user); db.commit(); db.refresh(user)

        print(f"[checkout] user_id={user.id} plan={plan} price_id={price_id} customer={cid}")

        session = stripe.checkout.Session.create(
            mode="subscription",
            customer=cid,
            line_items=[{"price": price_id, "quantity": 1}],
            payment_method_types=["card"],  # keep card-only (simple in test)
            allow_promotion_codes=True,
            # 👇 match your BillingPage.tsx which reads ?status=...
            success_url=f"{APP_BASE}/billing?status=success&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{APP_BASE}/billing?status=cancelled",
            metadata={"user_id": str(user.id), "plan": plan},
        )
        print("[checkout] created session:", session.id)
        return {"url": session.url}

    except stripe.error.StripeError as e:
        msg = getattr(e, "user_message", None) or str(e)
        print("StripeError (checkout):", msg)
        raise HTTPException(status_code=400, detail=f"Stripe error: {msg}")

    except Exception:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail="Server error creating checkout session")

@router.get("/portal")
def billing_portal(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return a link to Stripe's customer billing portal."""
    _require_env()
    try:
        # Auto-create a Stripe customer if missing (better UX)
        if not user.stripe_customer_id:
            cid = ensure_customer(user)
            db.add(user); db.commit(); db.refresh(user)
        else:
            cid = user.stripe_customer_id

        portal = stripe.billing_portal.Session.create(
            customer=cid,
            # 👇 send them back to the page you actually have
            return_url=f"{APP_BASE}/billing",
        )
        return {"url": portal.url}

    except stripe.error.StripeError as e:
        msg = getattr(e, "user_message", None) or str(e)
        print("StripeError (portal):", msg)
        raise HTTPException(status_code=400, detail=f"Stripe error: {msg}")

    except Exception:
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail="Server error creating billing portal session")

@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    """Handle Stripe webhooks to sync subscription status."""
    if not WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="Server misconfig: STRIPE_WEBHOOK_SECRET missing")

    payload = await request.body()
    sig = request.headers.get("stripe-signature")
    try:
        event = stripe.Webhook.construct_event(payload, sig, WEBHOOK_SECRET)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Webhook error: {e}")

    etype = event["type"]
    obj = event["data"]["object"]
    print("Webhook:", etype)

    def sync_user_from_subscription(sub: dict):
        cust = sub.get("customer")
        user = db.query(User).filter(User.stripe_customer_id == cust).first()
        if not user:
            print("[webhook] no local user for customer", cust)
            return
        _apply_subscription_to_user(user, sub, db)
        print(f"[webhook] synced user_id={user.id} status={user.subscription_status} plan={user.plan_key}")

    if etype in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
        sync_user_from_subscription(obj)
    elif etype == "checkout.session.completed" and obj.get("subscription"):
        # expand to get items + price interval for plan detection
        sub = stripe.Subscription.retrieve(obj.get("subscription"), expand=["items.data.price"])
        sync_user_from_subscription(sub)

    return {"ok": True}

@router.post("/sync")
def manual_sync(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Manually pull latest subscription from Stripe and persist to the user.
    Useful if a webhook was missed during local dev.
    """
    _require_env()
    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer")

    subs = stripe.Subscription.list(customer=user.stripe_customer_id, status="all", limit=1).data
    if not subs:
        return {"synced": False, "message": "No subscriptions for this customer"}
    sub = subs[0]
    _apply_subscription_to_user(user, sub, db)
    return {
        "synced": True,
        "status": user.subscription_status,
        "plan_key": user.plan_key,
        "current_period_end": user.subscription_current_period_end.isoformat() if user.subscription_current_period_end else None,
        "subscription_id": sub.id,
    }

@router.get("/status")
def subscription_status(user: User = Depends(get_current_user)):
    return {
        "plan_key": user.plan_key,
        "subscription_status": user.subscription_status,
        "current_period_end": user.subscription_current_period_end.isoformat() if user.subscription_current_period_end else None,
    }
