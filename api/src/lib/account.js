// Quota accounting. Messages are charged before the AI call (refunded on failure).
// Voice seconds are reserved when a call starts and the unused part refunded when it ends;
// calls that never report an end are hung up by the sweeper once their reservation runs out.
import { getDb } from './db.js';
import { limits, planOf, proPriceLabel, rollPeriod, usageStatus } from './plans.js';

const day = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const err = (status, code, message) => ({ ok: false, status, code, message });

export async function upsertUser(ident, now = Date.now()) {
  const db = await getDb();
  return db.update('users', ident.key, u => {
    const fresh = { key: ident.key, provider: ident.provider, createdAt: now, free: { msgs: 0, voiceSec: 0 }, pro: { periodStart: now, msgs: 0, voiceSec: 0 } };
    // A deleted account keeps only anonymous free-trial counters, so re-signing up doesn't reset the trial.
    const user = !u ? fresh : u.deleted ? { ...fresh, free: u.free || fresh.free } : u;
    if (ident.email) user.email = ident.email;
    if (ident.name && !user.name) user.name = ident.name;
    user.lastLogin = now;
    return user;
  });
}

// Account deletion: drop personal data; keep only the sign-in ID and free-trial usage.
export async function deleteUser(key, now = Date.now()) {
  await (await getDb()).update('users', key, u => (u ? { key, deleted: true, deletedAt: now, free: u.free || { msgs: 0, voiceSec: 0 } } : undefined));
  await (await getDb()).update('prefs', key, d => (d ? { deleted: true, at: now } : undefined)); // saved profile and progress go too
  await (await getDb()).update('prefs', `${key}~prog`, d => (d ? { deleted: true, at: now } : undefined));
}

export async function loadUser(ident) {
  if (ident?.viaCode) return { key: ident.key, admin: true };
  if (!ident) return null;
  const u = await (await getDb()).get('users', ident.key);
  return u && !u.deleted ? u : null;
}

export async function status(ident, now = Date.now()) {
  const user = await loadUser(ident);
  if (!user) return null;
  return { key: user.key, email: user.email || '', name: user.name || '', ...usageStatus(user, now) };
}

async function pool(field, delta, now) {
  const db = await getDb();
  const cap = limits().freePoolPerDay[field];
  let ok = true;
  await db.update('daily', day(now), d => {
    const cur = d || { msgs: 0, voiceSec: 0 };
    if (delta > 0 && cur[field] + delta > cap) { ok = false; return undefined; }
    cur[field] = Math.max(0, cur[field] + delta);
    return cur;
  });
  return ok;
}

async function poolLeft(field, now) {
  const d = await (await getDb()).get('daily', day(now));
  return Math.max(0, limits().freePoolPerDay[field] - (d?.[field] || 0));
}

const FREE_POOL_MSG = 'Free AI is at capacity for today. Upgrade to Pro or try again tomorrow.';
const quotaMsg = plan => (plan === 'pro'
  ? 'You\'ve used this month\'s Pro allowance. It resets at the start of your next billing period.'
  : `You've used your free AI allowance. Upgrade to Pro (${proPriceLabel()}) to keep going.`);

export async function consumeMsgs(ident, n, now = Date.now()) {
  const user = await loadUser(ident);
  if (!user) return err(401, 'signin', 'Sign in to use AI.');
  const plan = planOf(user, now);
  if (plan === 'admin') return { ok: true, plan };
  if (plan === 'free' && !(await pool('msgs', n, now))) return err(429, 'free_pool', FREE_POOL_MSG);
  let result = null;
  await (await getDb()).update('users', user.key, u => {
    rollPeriod(u, now);
    const bucket = plan === 'pro' ? u.pro : u.free;
    if (bucket.msgs + n > limits()[plan].msgs) { result = err(402, 'quota', quotaMsg(plan)); return undefined; }
    // Pro is unlimited for normal use, with a daily fair-use ceiling so one account cannot burn the month in a day.
    if (plan === 'pro') {
      const d = day(now);
      if (u.pro.day !== d) { u.pro.day = d; u.pro.dayMsgs = 0; }
      if (u.pro.dayMsgs + n > limits().pro.msgsPerDay) { result = err(429, 'fair_use', `You have reached today's fair-use limit of ${limits().pro.msgsPerDay} AI messages. It resets tomorrow.`); return undefined; }
      u.pro.dayMsgs += n;
    }
    bucket.msgs += n;
    return u;
  });
  if (result) { if (plan === 'free') await pool('msgs', -n, now); return result; }
  return { ok: true, plan };
}

export async function refundMsgs(ident, n, plan, now = Date.now()) {
  if (plan === 'admin' || !ident || ident.viaCode) return;
  await (await getDb()).update('users', ident.key, u => {
    if (!u) return undefined;
    rollPeriod(u, now);
    const bucket = plan === 'pro' ? u.pro : u.free;
    bucket.msgs = Math.max(0, bucket.msgs - n);
    if (plan === 'pro' && u.pro.day === day(now)) u.pro.dayMsgs = Math.max(0, (u.pro.dayMsgs || 0) - n);
    return u;
  });
  if (plan === 'free') await pool('msgs', -n, now);
}

export async function reserveVoice(ident, now = Date.now(), maxSec = null) {
  const user = await loadUser(ident);
  if (!user) return err(401, 'signin', 'Sign in to use voice mode.');
  const L = limits();
  const plan = planOf(user, now);
  const cap = maxSec || L.maxCallSec;
  if (plan === 'admin') return { ok: true, plan, allowedSec: L.adminCallSec };
  let allowed = 0;
  let result = null;
  await (await getDb()).update('users', user.key, u => {
    rollPeriod(u, now);
    const bucket = plan === 'pro' ? u.pro : u.free;
    allowed = Math.min(L[plan].voiceSec - bucket.voiceSec, cap);
    if (allowed < L.minCallSec) { result = err(402, 'quota', plan === 'free' ? `Your free voice minutes are used up. Upgrade to Pro for ${Math.floor(L.pro.voiceSec / 60)} voice minutes a month.` : quotaMsg('pro')); return undefined; }
    bucket.voiceSec += allowed;
    return u;
  });
  if (result) return result;
  if (plan === 'free') {
    const left = await poolLeft('voiceSec', now);
    const take = Math.min(allowed, left);
    if (take < L.minCallSec || !(await pool('voiceSec', take, now))) {
      await refundVoice(user.key, allowed, plan, null, now);
      return err(429, 'free_pool', FREE_POOL_MSG);
    }
    if (take < allowed) { await refundVoice(user.key, allowed - take, plan, null, now); allowed = take; }
  }
  return { ok: true, plan, allowedSec: allowed };
}

export async function refundVoice(key, sec, plan, poolDay, now = Date.now()) {
  if (plan === 'admin' || plan === 'live' || sec <= 0 || key === 'code:admin') return;
  await (await getDb()).update('users', key, u => {
    if (!u) return undefined;
    rollPeriod(u, now);
    const bucket = plan === 'pro' ? u.pro : u.free;
    bucket.voiceSec = Math.max(0, bucket.voiceSec - sec);
    return u;
  });
  if (plan === 'free' && poolDay) {
    await (await getDb()).update('daily', poolDay, d => (d ? { ...d, voiceSec: Math.max(0, d.voiceSec - sec) } : undefined));
  }
}

export async function recordCall(call) {
  await (await getDb()).update('calls', call.id, () => ({ ...call, status: 'active' }));
}

// Ends a call once; returns the call only to the first caller so refunds can't happen twice.
export async function endCall(id, { key, now = Date.now(), hangup } = {}) {
  let ended = null;
  await (await getDb()).update('calls', id, c => {
    if (!c || c.status !== 'active' || (key && c.key !== key)) return undefined;
    ended = { ...c, status: 'ended', endedAt: now };
    return ended;
  });
  if (!ended) return null;
  try { await hangup?.(id); } catch { /* call may already be over */ }
  const usedSec = Math.min(ended.allowedSec, Math.ceil((now - ended.start) / 1000));
  if (ended.plan === 'prolive') await chargeProLive(ended.key, usedSec, now);
  else await refundVoice(ended.key, ended.allowedSec - usedSec, ended.plan, ended.day, now);
  return { ...ended, usedSec };
}

// Hang up calls whose reserved time is over (grace 15s). Run on a timer and opportunistically.
export async function sweepCalls(hangup, now = Date.now()) {
  const db = await getDb();
  const overdue = await db.list('calls', c => c.status === 'active' && c.start + c.allowedSec * 1000 + 15000 < now);
  for (const c of overdue) {
    let mine = false;
    await db.update('calls', c.id, x => { if (x && x.status === 'active') { mine = true; return { ...x, status: 'expired', endedAt: now }; } return undefined; });
    if (mine && c.plan === 'prolive') await chargeProLive(c.key, c.allowedSec, now);
    try { await hangup(c.id); } catch { /* already gone */ }
  }
  return overdue.length;
}

// Consumable session credits for Live AI practice tests.
// txnId (the store transaction id) makes grants idempotent: the webhook can be retried and
// /billing/refresh reads the same purchases, so each purchase must count once.
// Storage fields keep the original names (sessionCredits / mockUntil) so credits bought
// before the rename keep working; the user-facing name is "Live AI".
export async function addSessionCredits(key, count = 1, now = Date.now(), txnId = '') {
  let added = false;
  await (await getDb()).update('users', key, u => {
    if (!u || u.deleted) return undefined;
    if (txnId) {
      u.creditTxns ||= [];
      if (u.creditTxns.includes(txnId)) return undefined;
      u.creditTxns.push(txnId);
    }
    u.sessionCredits = (u.sessionCredits || 0) + count;
    u.sessionCreditLast = now;
    added = true;
    return u;
  });
  return added;
}

// One credit opens a Live AI window of liveCallSec (wall clock). Reconnecting inside the window
// (dropped connection, app switch) resumes the remaining time instead of burning another credit.
export async function startLiveSession(key, now = Date.now()) {
  const L = limits();
  let out = { ok: false };
  await (await getDb()).update('users', key, u => {
    if (!u || u.deleted) return undefined;
    const left = Math.floor(((u.mockUntil || 0) - now) / 1000);
    if (left >= L.minCallSec) { out = { ok: true, allowedSec: left, resumed: true }; return undefined; }
    if (!u.sessionCredits) return undefined;
    u.sessionCredits--;
    u.mockUntil = now + L.liveCallSec * 1000;
    out = { ok: true, allowedSec: L.liveCallSec, resumed: false };
    return u;
  });
  return out;
}

// Pro's included Live AI: proLiveSessions a month, each a window of up to proLiveSec. Rejoining inside
// the window (dropped connection) resumes it instead of using another session.
export async function startProLive(key, now = Date.now()) {
  const L = limits();
  let out = { ok: false };
  await (await getDb()).update('users', key, u => {
    if (!u || u.deleted) return undefined;
    rollPeriod(u, now);
    // Minutes bank: the call may run for whatever is left; only connected time is charged, on hang-up.
    const left = Math.max(0, L.proLiveBankSec - (u.pro.liveSecUsed || 0));
    if (left < L.minCallSec) return u;
    out = { ok: true, allowedSec: left, resumed: false };
    return u;
  });
  return out;
}

export async function cancelProLive() { /* nothing is reserved up front any more */ }

// Pro minutes bank: charge the seconds a call was actually connected.
export async function chargeProLive(key, sec, now = Date.now()) {
  if (!(sec > 0)) return;
  await (await getDb()).update('users', key, u => {
    if (!u) return undefined;
    rollPeriod(u, now);
    u.pro.liveSecUsed = (u.pro.liveSecUsed || 0) + Math.ceil(sec);
    return u;
  });
}

// The voice connection could not be set up for a fresh session: give the credit back.
export async function cancelLiveSession(key) {
  await (await getDb()).update('users', key, u => {
    if (!u) return undefined;
    u.sessionCredits = (u.sessionCredits || 0) + 1;
    delete u.mockUntil;
    return u;
  });
}

export async function setProUntil(key, untilMs, now = Date.now()) {
  return (await getDb()).update('users', key, u => {
    if (!u) return undefined;
    const wasPro = u.proUntil && u.proUntil > now;
    u.proUntil = untilMs;
    if (!wasPro && untilMs > now) u.pro = { periodStart: now, msgs: 0, voiceSec: 0 };
    return u;
  });
}
