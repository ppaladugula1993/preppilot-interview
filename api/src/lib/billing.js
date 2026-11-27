// RevenueCat: one entitlement ("pro") across Apple, Google and (later) web purchases.
// The app logs in to RevenueCat with our user key, so app_user_id === our user key.
import { timingSafeEqual } from 'node:crypto';
import { setProUntil, addSessionCredits } from './account.js';

const ENTITLEMENT = () => process.env.REVENUECAT_ENTITLEMENT || 'pro';
// Store product id for the Live AI session. The product keeps its App Store Connect id.
const LIVE_PRODUCT = () => process.env.REVENUECAT_LIVE_PRODUCT || 'mock_session_60min';
// Website (Stripe) Live AI session: the Stripe product and its price.
const LIVE_IDS = () => new Set([LIVE_PRODUCT(), 'prod_VhtqWwLAP2TSrf', 'price_1UgU2OF8LmgwChbnTrBztUiJ']);
const GRANT = new Set(['INITIAL_PURCHASE', 'RENEWAL', 'PRODUCT_CHANGE', 'UNCANCELLATION', 'NON_RENEWING_PURCHASE', 'SUBSCRIPTION_EXTENDED', 'TEMPORARY_ENTITLEMENT_GRANT']);

export function webhookAuthorized(header) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected || typeof header !== 'string') return false;
  const a = Buffer.from(header), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function applyWebhook(body, now = Date.now()) {
  const e = body?.event;
  if (!e || e.type === 'TEST') return { ignored: true };
  const productIds = Array.isArray(e.product_ids) ? e.product_ids : [];
  const isLive = productIds.some(p => LIVE_IDS().has(p));
  if (!isLive && Array.isArray(e.entitlement_ids) && !e.entitlement_ids.includes(ENTITLEMENT())) return { ignored: true };
  const keys = [...new Set([e.app_user_id, e.original_app_user_id, ...(e.aliases || [])].filter(k => typeof k === 'string' && k.includes(':')))];
  if (!keys.length) return { ignored: true };
  // Consumable: Live AI session credit
  if (isLive && GRANT.has(e.type)) {
    const txn = String(e.transaction_id || e.id || '');
    for (const k of keys) await addSessionCredits(k, 1, now, txn);
    return { liveSession: keys };
  }
  const until = Number(e.expiration_at_ms) || 0;
  if (GRANT.has(e.type) && until > now) {
    for (const k of keys) await setProUntil(k, until, now);
    return { granted: keys, until };
  }
  if (e.type === 'EXPIRATION') {
    for (const k of keys) await setProUntil(k, Math.min(until || now, now), now);
    return { revoked: keys };
  }
  return { ignored: true }; // CANCELLATION / BILLING_ISSUE: access stays until expiration
}

// After a purchase the app asks the server to check RevenueCat directly, because the webhook can
// arrive a few seconds later. Uses RevenueCat API v2 when REVENUECAT_PROJECT_ID is set (v2 secret
// keys do not work with v1), otherwise the legacy v1 subscriber endpoint.
let v2Ids = null; // { entitlementId, liveProductIds } for the project, cached per instance
async function rcV2(path, secret) {
  const res = await fetch(`https://api.revenuecat.com/v2/projects/${encodeURIComponent(process.env.REVENUECAT_PROJECT_ID)}${path}`, {
    headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw Object.assign(new Error(`RevenueCat ${res.status}`), { status: 502 });
  return res.json();
}

export async function refreshFromRevenueCat(key, now = Date.now()) {
  const secret = process.env.REVENUECAT_SECRET_KEY;
  if (!secret) return { configured: false };
  if (process.env.REVENUECAT_PROJECT_ID) {
    if (!v2Ids) {
      const [ents, prods] = await Promise.all([rcV2('/entitlements?limit=100', secret), rcV2('/products?limit=100', secret)]);
      v2Ids = {
        entitlementId: (ents?.items || []).find(e => e.lookup_key === ENTITLEMENT())?.id || '',
        liveProductIds: new Set((prods?.items || []).filter(p => LIVE_IDS().has(p.store_identifier)).map(p => p.id)),
      };
    }
    const id = encodeURIComponent(key);
    const [active, purchases] = await Promise.all([rcV2(`/customers/${id}/active_entitlements?limit=100`, secret), rcV2(`/customers/${id}/purchases?limit=100`, secret)]);
    for (const p of purchases?.items || []) {
      if (!v2Ids.liveProductIds.has(p.product_id)) continue;
      const txn = String(p.store_purchase_identifier || p.id || '');
      if (txn) await addSessionCredits(key, 1, now, txn);
    }
    const ent = (active?.items || []).find(e => e.entitlement_id === v2Ids.entitlementId);
    if (!ent) return { configured: true, pro: false };
    const until = ent.expires_at ? Number(ent.expires_at) : now + 3650 * 86400000;
    await setProUntil(key, until, now);
    return { configured: true, pro: until > now, until };
  }
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(key)}`, {
    headers: { authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw Object.assign(new Error(`RevenueCat ${res.status}`), { status: 502 });
  const sub = (await res.json())?.subscriber;
  // Consumables: the webhook can land after the app asks for a refresh, so grant from here too (deduped by transaction).
  for (const p of sub?.non_subscriptions?.[LIVE_PRODUCT()] || []) {
    const txn = String(p.store_transaction_id || p.id || '');
    if (txn) await addSessionCredits(key, 1, now, txn);
  }
  const ent = sub?.entitlements?.[ENTITLEMENT()];
  if (!ent) return { configured: true, pro: false };
  const until = ent.expires_date ? Date.parse(ent.expires_date) : now + 3650 * 86400000;
  await setProUntil(key, until, now);
  return { configured: true, pro: until > now, until };
}
