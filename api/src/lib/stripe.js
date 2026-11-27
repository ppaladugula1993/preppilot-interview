// Website purchases: Stripe Checkout, then RevenueCat is told about the purchase so the "pro"
// entitlement (and Live AI credits) work the same as App Store purchases.
import { refreshFromRevenueCat } from './billing.js';

const SITE = () => process.env.SITE_URL || 'https://preppilot.us';
const PRICES = () => ({
  pro: process.env.STRIPE_PRICE_PRO || 'price_1UgU25F8LmgwChbnXdsjBxhl',
  live: process.env.STRIPE_PRICE_LIVE || 'price_1UgU2OF8LmgwChbnTrBztUiJ',
});
// RevenueCat public key for the Stripe app (public by design; safe to ship).
const RC_STRIPE_KEY = () => process.env.REVENUECAT_STRIPE_PUBLIC_KEY || 'strp_hwCsQFNAtsmtrhqFzKFSveKsjpf';

export const stripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;

function form(obj, pre = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = pre ? `${pre}[${k}]` : k;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}
async function stripe(method, path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method, headers: { authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
    body: body ? form(body) : undefined, signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(`Stripe ${res.status}: ${data?.error?.message || ''}`), { status: 502 });
  return data;
}

async function customerFor(key, email, create) {
  const q = encodeURIComponent(`metadata['app_user_id']:'${key.replace(/'/g, '')}'`);
  const found = (await stripe('GET', `customers/search?query=${q}&limit=1`)).data?.[0];
  if (found || !create) return found || null;
  return stripe('POST', 'customers', { email: email || undefined, metadata: { app_user_id: key } });
}

export async function createCheckout(ident, kind) {
  const price = PRICES()[kind];
  if (!price) throw Object.assign(new Error('unknown product'), { status: 400 });
  const cust = await customerFor(ident.key, ident.email, true);
  const s = await stripe('POST', 'checkout/sessions', {
    mode: kind === 'pro' ? 'subscription' : 'payment',
    customer: cust.id,
    client_reference_id: ident.key,
    line_items: [{ price, quantity: 1 }],
    metadata: { app_user_id: ident.key, kind },
    ...(kind === 'pro' ? { subscription_data: { trial_period_days: 3, metadata: { app_user_id: ident.key } } } : { payment_intent_data: { metadata: { app_user_id: ident.key } } }),
    allow_promotion_codes: true,
    success_url: `${SITE()}/?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE()}/?paid=cancel`,
  });
  return { url: s.url };
}

// Called when the user lands back on the site after paying.
export async function confirmCheckout(ident, sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ''))) throw Object.assign(new Error('bad session'), { status: 400 });
  const s = await stripe('GET', `checkout/sessions/${sessionId}`);
  if (s.client_reference_id !== ident.key) throw Object.assign(new Error('not your purchase'), { status: 403 });
  if (s.status !== 'complete') return { complete: false };
  const r = await fetch('https://api.revenuecat.com/v1/receipts', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { 'content-type': 'application/json', 'x-platform': 'stripe', authorization: `Bearer ${RC_STRIPE_KEY()}` },
    body: JSON.stringify({ app_user_id: ident.key, fetch_token: s.subscription || sessionId }),
  });
  if (!r.ok) throw Object.assign(new Error(`RevenueCat ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: 502 });
  return { complete: true, ...(await refreshFromRevenueCat(ident.key)) };
}

export async function portal(ident) {
  const cust = await customerFor(ident.key, '', false);
  if (!cust) throw Object.assign(new Error('No website subscription found'), { status: 404 });
  const p = await stripe('POST', 'billing_portal/sessions', { customer: cust.id, return_url: `${SITE()}/` });
  return { url: p.url };
}
