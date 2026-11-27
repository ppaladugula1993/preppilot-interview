import { LEVELS, buildPlan, rankTopics, dueCards, review, readiness, interviewRound, topicWeight, knowledgeMap, profileSummary, migrateProfile, effectiveRoles, daysUntil } from './plan.js';
import { store } from './store.js';
import { ai } from './ai.js';
import { voice } from './voice.js';
import { VoiceSession, realtimeSupported } from './realtime.js';
import { native, signedIn, signOut, renderGoogleButton, refreshAccount, onAccountChange, nativeSignIn, nativePurchase, nativeBuyLive, nativeRestore, listenNative, notifyBadge, notifyDaily, notifyWeek, promptNotifications } from './auth.js';
import { initContent, getCatalog, getManifest, roleById, topicMeta, ensureTopics, ensureForProfile, loadedTopics, reportUrl } from './content.js';
import { diagramHtml, diagramFor, storyView, registerDiagramSpec } from './diagrams.js';
import { todayKey, recordActivity, streakDays, lastNDays } from './stats.js';
import { popOutCards, pipSupport, pipOpen } from './pip.js';
import { ringOffset, nextStage, prevStage, sceneName } from './animate.js';

const DAY = 86400000;
const app = document.getElementById('app');
const S = { view: 'home', topic: null, ci: 0, deck: null, di: 0, reveal: false, busy: false, listening: false, chatContext: '',
  rt: null, rtMode: null, rtStatus: '', rtStarting: false, voiceServer: false, live: null, pendingUser: false, muted: false,
  googleClientId: '', plans: null, paywall: false, draft: null, roleSearch: '', showPlans: false, fullPlan: false, allTopics: false, buying: null, buyBusy: false, healthLoaded: false, liveInterviewIos: false, lastView: '', liveHint: null, suggestPending: false, dgStages: {}, prevMap: null, sheetDg: null };

/* ---------- helpers ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Why / Example / Trap lines under an answer (cards that have them).
const learnBody = q => `<div class="learn-row"><b>Why</b><p>${fmt(q.why)}</p></div>${q.ex ? `<div class="learn-row"><b>Example</b><div class="learn-ex">${fmt(q.ex)}</div></div>` : ''}${q.trap ? `<div class="learn-row trap"><b>Trap</b><p>${fmt(q.trap)}</p></div>` : ''}`;
const learnHtml = q => (q?.why ? `<details class="learn"><summary>${ic('bulb')}Why · Example · Trap</summary>${learnBody(q)}</details>` : '');
const fmt = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
// Chat answers: real paragraphs, headings, bullet and numbered lists, code blocks (ChatGPT-style).
const inl = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
function mdChat(src) {
  const parts = String(src ?? '').split(/```[a-zA-Z0-9+#-]*\n?/);
  return parts.map((p, i) => {
    if (i % 2) return `<pre><code>${esc(p.replace(/\n$/, ''))}</code></pre>`;
    const out = []; let list = null, para = [];
    const flushP = () => { if (para.length) { out.push(`<p>${para.map(inl).join('<br>')}</p>`); para = []; } };
    const flushL = () => { if (list) { out.push(`<${list.tag}>${list.items.map(x => `<li>${inl(x)}</li>`).join('')}</${list.tag}>`); list = null; } };
    for (const raw of p.split('\n')) {
      const line = raw.trimEnd();
      let m;
      if (!line.trim()) { flushP(); flushL(); continue; }
      if ((m = line.match(/^\s*(#{1,4})\s+(.*)$/))) { flushP(); flushL(); out.push(`<h${Math.min(4, m[1].length + 2)}>${inl(m[2])}</h${Math.min(4, m[1].length + 2)}>`); continue; }
      if ((m = line.match(/^\s*(?:[-*•])\s+(.*)$/))) { flushP(); if (list?.tag !== 'ul') { flushL(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); if (list?.tag !== 'ol') { flushL(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
      if (list && /^\s{2,}\S/.test(raw)) { list.items[list.items.length - 1] += ' ' + line.trim(); continue; }
      flushL(); para.push(line);
    }
    flushP(); flushL();
    return out.join('');
  }).join('');
}
function md(s) {
  const parts = String(s ?? '').split(/```[a-zA-Z]*\n?/);
  return parts.map((p, i) => (i % 2 ? `<pre><code>${esc(p.replace(/\n$/, ''))}</code></pre>` : fmt(p).replace(/(^|<br>)[-*] /g, '$1• '))).join('');
}
const ICONS = {
  code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  pip: '<rect x="3" y="5" width="18" height="14" rx="2"/><rect x="12" y="12" width="7" height="5" rx="1"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micoff: '<path d="M9 9v2a3 3 0 0 0 5 2.2M15 9.5V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.4 2.3M12 18v3M3 3l18 18"/>',
  ear: '<path d="M6 9a6 6 0 1 1 12 0c0 3-2.5 4-3.5 5.5S14 18 12 19.5 7.5 19 7.5 17"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-1.5 2-2 3"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2.5"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M4 12.5 9.5 18 20 6.5"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.7 7.5 9 4.3-1.3 7.5-4.5 7.5-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z"/>',
  cards: '<rect x="3" y="7" width="14" height="13" rx="2.5"/><path d="M7 4h11a3 3 0 0 1 3 3v10"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h13"/>',
  sound: '<path d="M4 9h3l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  soundoff: '<path d="M4 9h3l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h10"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
const ic = n => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
const ticks = (items, cls = '') => `<ul class="ticks ${cls}">${items.filter(Boolean).map(t => `<li>${ic('check')}<span>${t}</span></li>`).join('')}</ul>`;
function toast(msg, kind = '') {
  const t = Object.assign(document.createElement('div'), { className: `toast ${kind}`, innerHTML: `${ic(kind === 'bad' ? 'alert' : 'check')}<span>${esc(msg)}</span>` });
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'bad' ? 6000 : 4200);
}
const oops = msg => toast(msg, 'bad');
function closeSheet() { document.getElementById('sheet')?.remove(); S.sheetDg = null; }
function sheet(html) {
  closeSheet();
  document.body.appendChild(Object.assign(document.createElement('div'), { id: 'sheet', innerHTML: `<div role="dialog" aria-modal="true">${html}</div>` }));
}
// The diagram sheet lives outside #app, so a plain render() never refreshes
// it — the player inside it has to rebuild the sheet itself.
function dgSheetHtml(id) {
  return `<div class="stack"><h2>${esc(topicName(id))}</h2>${diagramTeaser(id, diagramHtml(id, S.dgStages[id] ?? null))}<button class="btn block" data-act="closesheet">Back to the cards</button></div>`;
}
function refreshDgSheet(id) {
  if (S.sheetDg !== id || !document.getElementById('sheet')) return;
  sheet(dgSheetHtml(id));
  S.sheetDg = id; // sheet() clears it via closeSheet(); restore it.
}

const topics = () => [...loadedTopics(), ...store.customTopics(), ...store.privatePacks().flatMap(p => p.topics.map(t => ({ ...t, private: true })))];
const topicById = id => topics().find(t => t.id === id);
const topicName = id => topicById(id)?.name || topicMeta(id)?.name || id;
const roleName = id => roleById(id)?.name || id;
const profile = () => store.profile();
const summary = () => profileSummary(profile(), { roleName, topicName });
const isNotice = m => /^(ℹ️|⚠️)/.test(m.content);

function planFor(p) { return buildPlan(topics(), p, p.planStart || Date.now()); }
function todayIndex(p) { return Math.max(0, Math.floor((Date.now() - (p.planStart || Date.now())) / DAY)); }

function betaNote(t, where) {
  return t?.beta ? `<div class="small muted"><a class="link quiet small" href="${esc(reportUrl(t, where))}" target="_blank" rel="noopener">Report a problem</a></div>` : '';
}

/* ---------- what Free can open ---------- */
// Free: the plan, and the first FREE_TOPICS topics in it, without the animated diagrams.
// Pro (or admin / beta code): everything. Topics the user wrote or imported are always open.
// This is a client-side gate on public study content; the AI itself is enforced on the server.
const FREE_TOPICS = 3;
// Free flashcards: FREE_CARDS per technology (role) the user picked, a fixed shuffled sample across
// that role's topics. Pro: every card, in workflow order.
const FREE_CARDS = 10;
function seeded(seed) { let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296; }
function shuffle(list, rnd = Math.random) { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function freeCardIds() {
  const p = profile();
  if (!p) return new Set();
  const ids = new Set();
  for (const rid of effectiveRoles(migrateProfile(p))) {
    const role = roleById(rid);
    const pool = topics().filter(t => (role?.topics?.[t.id] || 0) >= 3 && !['behavioral', 'scenarios'].includes(t.id)).flatMap(t => t.qa.map((_, i) => `${t.id}-${i}`));
    shuffle(pool, seeded(rid + store.clientId())).slice(0, FREE_CARDS).forEach(id => ids.add(id));
  }
  return ids;
}
const isAdmin = () => !!store.account()?.unlimited;
const hasPro = () => { const a = store.account(); return !!(a?.unlimited || a?.plan === 'pro' || store.accessCode()); };
function freeTopicIds() {
  const p = profile();
  // Behavioral is open to everyone and does not use up one of the free technical topics.
  return new Set(p ? ['behavioral', ...rankTopics(topics(), p).filter(t => !t.custom && !t.private && !['behavioral', 'scenarios'].includes(t.id)).slice(0, FREE_TOPICS).map(t => t.id)] : []);
}
function isLocked(id) {
  if (hasPro()) return false;
  const t = topicById(id);
  if (t?.custom || t?.private) return false;
  return !freeTopicIds().has(id);
}
// A diagram Free users can see but not use: blurred, with the way in on top.
function diagramTeaser(id, html) {
  if (hasPro()) return html;
  return `<div class="teaser" aria-label="Animated diagram, part of Pro"><div class="teaser-blur" aria-hidden="true" inert>${html}</div>
    <div class="teaser-over"><b>${ic('lock')}This picture draws itself, step by step</b><span class="muted small">Animated diagrams for every topic come with Pro.</span><button class="btn primary" data-act="plans">See pricing</button></div></div>`;
}

/* ---------- fresh from the field: a new scenario for the role every 6 hours ---------- */
async function loadFresh() {
  const p = profile();
  const role = p && migrateProfile(p).roleIds.find(id => id !== 'other') || p?.baseRoleId;
  if (!role || S.freshRole === role) return;
  S.freshRole = role;
  try { const d = await ai.post('/api/fresh', { role }); S.fresh = d; if (S.view === 'chat' && !S.showPlans && !S.rt) render(); } catch { S.fresh = null; }
}
function freshCard() {
  const f = S.fresh;
  if (!f?.title) return '';
  const hrs = Math.max(0, Math.round((Date.now() - (f.at || Date.now())) / 3600000));
  const pts = `<ol class="fresh-points">${f.points.map(x => `<li>${esc(x)}</li>`).join('')}</ol>${f.analogy ? `<p class="say" style="margin-top:12px">${esc(f.analogy)}</p>` : ''}`;
  return `<section class="panel stack fresh">
    <div class="row between small muted"><span>Fresh from the field</span><span>${hrs ? `${hrs}h ago` : 'just now'}, new every 6 hours</span></div>
    <h3 style="font:500 1.3rem/1.3 var(--serif)">${esc(f.title)}</h3>
    <p class="muted">${esc(f.situation)}</p>
    <p><b>${esc(f.question)}</b></p>
    ${hasPro() ? `<details><summary>What a strong answer covers</summary>${pts}</details>`
      : `<div class="teaser" style="min-height:140px"><div class="teaser-blur" aria-hidden="true" inert>${pts}</div><div class="teaser-over"><b>${ic('lock')}What a strong answer covers</b><span class="muted small">A new scenario for your role every 6 hours, answered, with Pro.</span><button class="btn primary" data-act="plans">See pricing</button></div></div>`}
  </section>`;
}

/* ---------- pricing facts (server-provided, with offline fallbacks) ---------- */
function offer() {
  const P = S.plans;
  const [amount, per = 'month'] = (P?.pro.price || '$6.99/month').split('/');
  const n = parseFloat(amount.replace(/[^\d.]/g, ''));
  return {
    freeMsgs: P?.free.msgs ?? 15, freeVoice: P?.free.voiceMin ?? 2,
    proMsgs: P?.pro.msgs ?? 500, proVoice: P?.pro.voiceMin ?? 0, proLive: P?.pro.liveMin ?? 30, proLiveN: P?.pro.liveSessions ?? 0, proPrice: `${amount}/${per}`, proAmount: amount, proPer: per,
    perDay: amount.trim().startsWith('$') && n > 0 && per === 'month' ? `About ${Math.round((n / 30) * 100)}¢ a day` : '',
    livePrice: P?.live?.price || '$15.99', liveMin: P?.live?.minutes ?? 60,
  };
}
const storeName = () => (window.PP_PLATFORM === 'android' ? 'Google Play' : 'App Store');
const liveState = () => { const a = store.account(); return { credits: a?.sessionCredits || 0, left: a?.liveSecLeft || 0 }; };

/* ---------- badge + daily notification (native app only) ---------- */
// The daily nudge rotates one per day through web/content/nudges.json.
// {topic} and {due} are filled in from today's plan. The native side only
// schedules what it is sent; nothing here prompts without the user having
// finished a flashcard round first (see the grade handler below).
let NUDGES = null;
async function loadNudges() {
  try {
    const res = await fetch('content/nudges.json');
    if (res.ok) NUDGES = await res.json();
  } catch { /* fallback nudge below */ }
}
const FALLBACK_NUDGE = { title: 'Today', body: 'A quick round of {topic} is waiting.' };
function pickNudge(topic, due) {
  const list = NUDGES?.nudges?.length ? NUDGES.nudges : [FALLBACK_NUDGE];
  const pool = due === 0 ? list.filter(n => !n.body.includes('{due}')) : list;
  const use = pool.length ? pool : list;
  const today = new Date().toISOString().slice(0, 10);
  let idx = store.nudgeIndex();
  if (store.nudgeDay() !== today) { idx = (idx + 1) % use.length; store.setNudgeIndex(idx); store.setNudgeDay(today); }
  const n = use[idx % use.length];
  return { title: n.title, body: n.body.replaceAll('{topic}', topic).replaceAll('{due}', String(due)) };
}
// What to work on next: the first open topic in the user's order that is not solid yet.
// No calendar: people move at their own pace.
function nextTopic(p = profile()) {
  if (!p) return null;
  const prog = store.progress();
  const all = rankTopics(topics(), p).filter(t => !isLocked(t.id));
  // Lead with the user's technology; the soft-skill topics come after.
  const list = [...all.filter(t => !['behavioral', 'scenarios'].includes(t.id)), ...all.filter(t => ['behavioral', 'scenarios'].includes(t.id))];
  // Just added a role in Profile: lead with its topics.
  let fresh = []; try { fresh = JSON.parse(lsGet('pp.newTopics', 'null'))?.ids || []; } catch { /* none */ }
  const open = t => { const r = readiness([t], p, prog); return r.total && r.pct < 80; };
  return list.find(t => fresh.includes(t.id) && open(t)) || list.find(open) || list[0] || null;
}

function dailyReminder() {
  const p = profile();
  if (!p) return null;
  const prog = store.progress();
  const nt = nextTopic(p);
  const due = dueCards(topics(), p, prog, Date.now(), 999);
  const topic = nt ? nt.name : due[0] ? topicName(due[0].topic) : 'practice';
  const line = `Up next: ${topic}`;
  const n = pickNudge(topic, due.length);
  return { title: n.title, body: `${line}. ${n.body}`.slice(0, 240), due: due.length };
}
// A week of reminders, scheduled ahead so every morning is different even if the app stays closed.
// Context first (interview countdown, streak at risk, unused Live AI minutes, coming back), then jokes.
function reminderWeek() {
  const p = profile();
  if (!p) return [];
  const prog = store.progress();
  const nt = nextTopic(p);
  const due = dueCards(topics(), p, prog, Date.now(), 999).length;
  const topic = nt ? nt.name : 'your next topic';
  const list = NUDGES?.nudges?.length ? NUDGES.nudges : [FALLBACK_NUDGE];
  const streak = streakDays(store.activity(), todayKey());
  const acc = store.account();
  const liveMin = acc?.plan === 'pro' ? acc.proLiveLeft || 0 : 0;
  const fill = s => s.replaceAll('{topic}', topic).replaceAll('{due}', String(due));
  const out = [];
  const start = store.nudgeIndex() || 0;
  for (let i = 1; i <= 7; i++) {
    // A random moment each day between 10:00 and 20:30, so reminders never feel like an alarm.
    const at = new Date(); at.setDate(at.getDate() + i); at.setHours(10, 0, 0, 0);
    at.setMinutes(Math.floor(Math.random() * 630));
    let n;
    if (liveMin >= 10 && i === 3) n = { title: `${liveMin} Live AI minutes, just sitting there`, body: 'Say your answers out loud to an interviewer that never sighs. Even five minutes counts.' };
    else if (i === 6 && streak === 0) n = { title: 'We saved your seat', body: `No guilt, no streak drama. Just ${topic}, whenever you're ready.` };
    else { const pick = list[(start + i) % list.length]; n = { title: fill(pick.title), body: fill(pick.body) }; }
    out.push({ at: at.getTime(), title: n.title.slice(0, 80), body: n.body.slice(0, 200) });
  }
  // Tonight: protect a live streak if nothing was practised today.
  const today = store.activity()?.[todayKey()];
  if (streak > 0 && !today) {
    const ev = new Date(); ev.setHours(18, 0, 0, 0); ev.setMinutes(Math.floor(Math.random() * 150));
    if (ev.getTime() > Date.now() + 600000) out.unshift({ at: ev.getTime(), title: `Your ${streak}-day streak is nervous`, body: `One ${topic} card keeps it alive. That's the whole ask.` });
  }
  return out;
}
let lastBadge = -1, lastDailyKey = '', lastWeekKey = '';
function syncNativeHome() {
  const d = dailyReminder();
  if (!d) return;
  if (d.due !== lastBadge) { lastBadge = d.due; notifyBadge(d.due); }
  const key = `${d.title}|${d.body}`;
  if (key !== lastDailyKey) { lastDailyKey = key; notifyDaily(d.title, d.body); }
  const week = reminderWeek(), wk = new Date().toDateString() + (store.activity()?.[todayKey()] ? 'p' : '');
  if (week.length && wk !== lastWeekKey) { lastWeekKey = wk; notifyWeek(week); } // newer app builds; older ones ignore it
}

/* ---------- onboarding ---------- */
// The form re-renders when the role changes (role decides which extras and self-rating chips appear),
// so field values are mirrored into S.draft first.
function captureDraft() {
  const f = document.getElementById('profileForm');
  if (!f || !S.draft) return;
  const fd = new FormData(f);
  for (const k of ['level', 'background', 'goal', 'interviewDate', 'otherRole', 'baseRoleId']) if (fd.has(k)) S.draft[k] = String(fd.get(k) || '').trim();
  const rated = [...f.querySelectorAll('.chip.rate')];
  if (rated.length) {
    S.draft.strong = rated.filter(b => b.classList.contains('strong')).map(b => b.dataset.id);
    S.draft.weak = rated.filter(b => b.classList.contains('weak')).map(b => b.dataset.id);
  }
  const extras = [...f.querySelectorAll('.chip.extra')];
  if (extras.length) S.draft.extras = extras.filter(b => b.classList.contains('on')).map(b => b.dataset.id);
}

// The landing animation: one phone, three scenes on a loop (a card turns over, a diagram draws
// itself, Live AI listens and puts talking points on screen). Pure SVG + CSS, no video to load.
function heroAnim() {
  return `<div class="hero-anim" aria-hidden="true"><svg viewBox="0 0 360 300">
    <rect class="ha-phone" x="95" y="8" width="170" height="284" rx="22"/>
    <rect class="ha-notch" x="155" y="16" width="50" height="6" rx="3"/>
    <g class="ha-s1">
      <text class="ha-lbl" x="112" y="48">Java · Fundamentals</text>
      <rect class="ha-card" x="110" y="58" width="140" height="150" rx="10"/>
      <text class="ha-q" x="122" y="88">How does a HashMap</text><text class="ha-q" x="122" y="106">find your value?</text>
      <g class="ha-ans"><line class="ha-rule" x1="122" y1="122" x2="238" y2="122"/>
        <text class="ha-a" x="122" y="142">hash(key) picks a bucket,</text><text class="ha-a" x="122" y="158">equals() picks the entry.</text>
        <text class="ha-a" x="122" y="174">Bad hashCode = slow map.</text></g>
      <rect class="ha-btn ha-got" x="110" y="222" width="66" height="26" rx="7"/><text class="ha-bt" x="143" y="239">Missed</text>
      <rect class="ha-btn ha-got2" x="184" y="222" width="66" height="26" rx="7"/><text class="ha-bt" x="217" y="239">Got it</text>
    </g>
    <g class="ha-s2">
      <text class="ha-lbl" x="112" y="48">A request, step by step</text>
      ${[['Client', 70], ['Gateway', 112], ['Service', 154], ['Database', 196]].map(([n, y], i) => `<g class="ha-node" style="--i:${i}"><rect x="130" y="${y}" width="100" height="28" rx="7"/><text x="180" y="${y + 18}">${n}</text></g>${i < 3 ? `<line class="ha-arrow" style="--i:${i}" x1="180" y1="${y + 28}" x2="180" y2="${y + 42}"/>` : ''}`).join('')}
      <circle class="ha-dot" r="4" cx="180" cy="84"/>
    </g>
    <g class="ha-s3">
      <text class="ha-lbl" x="112" y="48">Practising out loud</text>
      ${Array.from({ length: 13 }, (_, i) => `<rect class="ha-wave" style="--i:${i}" x="${118 + i * 10}" y="64" width="5" height="34" rx="2.5"/>`).join('')}
      <text class="ha-q" x="112" y="128">“Tell me about a time</text><text class="ha-q" x="112" y="144">prod went down.”</text>
      ${['Situation: 2 a.m. page, 5xx', 'Rolled back in 4 min', 'Fixed the alert, wrote RCA'].map((t, i) => `<g class="ha-pt" style="--i:${i}"><circle cx="117" cy="${170 + i * 22}" r="2.5"/><text class="ha-a" x="126" y="${174 + i * 22}">${t}</text></g>`).join('')}
    </g>
  </svg>
  <div class="ha-caption"><span class="c1">Cards that come back when you miss them</span><span class="c2">Pictures that draw themselves</span><span class="c3">Practise your answers out loud</span></div></div>`;
}

// Lanes people recognise, each pointing at the topics a newcomer would expect to see.
const LANES = [
  ['Java', ['java-core', 'spring']],
  ['React', ['react', 'js-core']],
  ['Python', ['python-core']],
  ['SQL & data', ['sql', 'spark']],
  ['Cloud & DevOps', ['docker', 'k8s', 'git']],
  ['AI & LLMs', ['llm-apps', 'ml-fundamentals']],
];

// Landing scroll story: an interviewer's question writes itself as you scroll, there is the
// blank moment, then the answer comes back line by line. Scrolling up rewinds it.
// A different interview moment on each visit: the question, then the lines that come back.
const STORIES = [
  { tech: 'Java', q: 'So… walk me through how a HashMap actually finds a value.', a: [
    ['hashCode()', 'turns the key into a number that picks the bucket'],
    ['equals()', 'checks which entry in that bucket is really yours'],
    ['0.75 load factor', 'past that, the table doubles and everything is rehashed'],
    ['Java 8+', 'a crowded bucket turns into a tree, so lookups stay fast']] },
  { tech: 'Kubernetes', q: 'A pod keeps restarting in production. Where do you look first?', a: [
    ['kubectl describe pod', 'events show OOMKilled, failed probes or image pulls'],
    ['kubectl logs --previous', 'the crash output from the container that just died'],
    ['liveness probe', 'too strict, and Kubernetes kills a slow but healthy app'],
    ['limits', 'memory over the limit means the kernel kills it, exit 137']] },
  { tech: 'React', q: 'Why does this component re-render when nothing on screen changed?', a: [
    ['new props', 'a fresh object or function each render looks like a change'],
    ['parent render', 'children re-render too, unless wrapped in React.memo'],
    ['useMemo / useCallback', 'keep the same reference between renders'],
    ['context', 'every consumer re-renders when the value changes']] },
  { tech: 'SQL', q: 'This query was fast last week and slow today. How do you find out why?', a: [
    ['EXPLAIN ANALYZE', 'shows the real plan and where the time goes'],
    ['seq scan', 'a missing or unused index on the filter column'],
    ['stale statistics', 'ANALYZE so the planner sees the new data size'],
    ['locks', 'check for a long transaction blocking the table']] },
  { tech: 'Python', q: 'You added threads and the CPU-heavy job got no faster. Why?', a: [
    ['the GIL', 'only one thread runs Python bytecode at a time'],
    ['threads', 'still great for waiting on network and disk'],
    ['multiprocessing', 'separate processes, so every core does real work'],
    ['asyncio', 'one thread juggling many waits, not more CPU']] },
  { tech: 'Git', q: 'A bad commit is already on main and others have pulled it. What do you do?', a: [
    ['git revert <sha>', 'adds a new commit that undoes it, history stays intact'],
    ['no force-push', 'rewriting shared history breaks everyone else'],
    ['-m 1', 'needed when the commit you revert is a merge'],
    ['then fix forward', 'a proper fix lands in its own commit with a test']] },
];
let STORY = STORIES[Math.floor(Math.random() * STORIES.length)];
function storyHtml() {
  const words = STORY.q.split(' ');
  return `<section class="l-story" id="lStory" aria-label="How it feels in the interview">
    <div class="l-stage">
      <div class="l-stage-in">
        <p class="l-tag">## the moment that matters · ${esc(STORY.tech)}</p>
        <div class="l-who"><span class="l-avatar" aria-hidden="true">${ic('mic')}</span><span>Interviewer</span><span class="l-wave" aria-hidden="true">${Array.from({ length: 7 }, (_, i) => `<i style="--w:${i}"></i>`).join('')}</span></div>
        <p class="l-q" aria-label="${esc(STORY.q)}" style="--n:${words.length}">${words.map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' ')}<span class="l-caret" aria-hidden="true"></span></p>
        <p class="l-blank" aria-hidden="true"><span class="l-dot"><i></i></span><span class="l-blank-t">you, a second later…</span></p>
        <ol class="l-ans" style="--n:${STORY.a.length}">${STORY.a.map(([k, v], i) => `<li style="--i:${i}"><span class="l-tick" aria-hidden="true">${ic('check')}</span><code>${esc(k)}</code><span>${esc(v)}</span></li>`).join('')}</ol>
        <p class="l-done">That’s a card you went through last Tuesday. <b>It came back.</b></p>
      </div>
    </div>
  </section>`;
}
function storyCta() {
  return `<section class="l-after"><h2 class="l-h2">Make sure yours comes back too.</h2>
    <div class="row l-cta"><button class="btn primary lg" data-act="startonboard">Get started, it’s free</button><button class="btn lg" data-act="login">I have an account</button></div>
    <p class="muted small">No card needed. Takes about a minute.</p></section>`;
}
// Scroll-linked, but cheap: each frame writes two CSS variables (story progress and how far the hero
// has scrolled away); words, the caret, answer lines and the giant word are styled from those in CSS
// with opacity and transform only, so the browser never re-lays out the page while scrolling.
let storyRaf = 0, storyLast = -1;
function paintStory() {
  storyRaf = 0;
  const el = document.getElementById('lStory');
  if (!el) return;
  const vh = window.innerHeight;
  const r = el.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - vh)));
  const hero = document.querySelector('.l-hero');
  if (hero) { const h = hero.getBoundingClientRect(); hero.style.setProperty('--hp', Math.min(1, Math.max(0, -h.top / Math.max(1, h.height))).toFixed(3)); }
  if (Math.abs(p - storyLast) < 0.001) return;
  storyLast = p;
  el.style.setProperty('--p', p.toFixed(4));
  el.classList.toggle('thinking', p >= 0.4 && p < 0.55);
  el.classList.toggle('done', p >= 0.92);
}
// Inside the app the page scrolls in <body> (see html.in-app in app.css): WebKit then uses Safari's own
// momentum, whatever the native shell's scroll settings are. These helpers work for both cases.
const inApp = () => document.documentElement.classList.contains('in-app');
const scrollToY = y => (inApp() ? document.body.scrollTo({ top: y }) : window.scrollTo({ top: y }));
const scrollYNow = () => (inApp() ? document.body.scrollTop : window.scrollY);
// Capture phase: hears both window and <body> scrolling.
document.addEventListener('scroll', () => { if (!storyRaf) storyRaf = requestAnimationFrame(paintStory); }, { passive: true, capture: true });
window.addEventListener('resize', () => { storyLast = -1; paintStory(); });

function loginView() {
  return `<div class="stack" style="max-width:420px;margin:0 auto;padding-top:24px">
    <button class="back" data-act="loginback">${ic('left')}Back</button>
    <div class="head"><h1 class="l-title" style="font-size:2rem">Welcome back</h1>
      <p class="muted" style="margin-top:8px">Log in to pick up your AI messages, Live AI sessions and Pro.</p></div>
    ${native()
      ? `<div class="stack tight">${window.PP_PLATFORM === 'ios' ? '<button class="btn primary block lg" data-act="nsignin" data-p="apple"> Sign in with Apple</button>' : ''}<button class="btn ${window.PP_PLATFORM === 'ios' ? '' : 'primary'} block lg" data-act="nsignin" data-p="google">Continue with Google</button></div>`
      : (S.googleClientId ? '<div id="gbtn"></div>' : `<p class="muted small">${S.healthLoaded ? 'Sign-in is being set up. Check back soon.' : 'Loading sign-in…'}</p>`)}
    <p class="muted small">New here? <button class="link" data-act="startonboard">Get started instead</button></p>
    <p class="muted small">Your study progress is saved on each device. On a new device, pick your role again after logging in.</p>
  </div>`;
}

/* ---------- Landing v2 preview (?v2): feature showcase + Free vs Pro ---------- */
const LANDING_V2 = (() => { try { return new URLSearchParams(location.search).has('v2'); } catch { return false; } })();
const FEATURES = [
  { k: 'cards', name: 'Flashcards', line: 'Swipe right on what you know. Like Tinder, but for your next job.', pts: ['30+ roles, Java to cloud to AI', 'Swipe mode mixes all your skills', 'Misses come back first'],
    demo: () => `<div class="fd fd-cards">
      <div class="fdc fdc-3"></div><div class="fdc fdc-2"></div>
      <div class="fdc fdc-1"><div class="fdc-in">
        <div class="fdc-front"><span class="fd-tag">Java · Collections</span><b>How does a HashMap find a value?</b><span class="fd-tap">Tap to flip</span></div>
        <div class="fdc-back"><span class="fd-tag">Answer</span><b>Hash the key → pick a bucket → compare with equals.</b><span class="fd-meta">O(1) average · tree when crowded</span></div>
      </div></div>
      <span class="fd-stamp">${ic('check')} Got it</span></div>` },
  { k: 'live', name: 'Live mock interview', line: 'A voice interviewer that asks, listens and grades.', pts: ['Speaks to you, waits while you think', '“How to answer” points as each question lands', 'Strong / Ok / Weak after every answer'], pro: true,
    demo: () => `<div class="fd fd-live">
      <div class="fdl-who"><span class="l-avatar">${ic('mic')}</span><b>Interviewer</b><span class="l-wave">${Array.from({ length: 7 }, (_, i) => `<i style="--w:${i}"></i>`).join('')}</span></div>
      <p class="fdl-q">How does Kafka keep order for one customer?</p>
      <div class="fdl-hint"><span class="fd-tag">How to answer</span><ul><li style="--k:0">Key by customer ID</li><li style="--k:1">Same key → same partition</li><li style="--k:2">Order holds per partition</li></ul></div>
      <div class="fdl-you"><span class="fd-tag">You</span>“We key each message by customer ID, so…”</div>
      <span class="fdl-grade">Strong.</span></div>` },
  { k: 'job', name: 'Role Ready', line: 'Paste a job post or type a role. Get decks for the skills it tests.', pts: ['Skills picked from the posting or the role', 'A deck for each skill, basics to scenarios', 'Ready in seconds, saved for later'], pro: true,
    demo: () => `<div class="fd fd-job">
      <div class="fdj-post"><i></i><i style="width:88%"></i><i style="width:64%"></i></div>
      <div class="fdj-chips">${['TypeScript', 'React 18', 'Node.js', 'PostgreSQL', 'GraphQL'].map((n, i) => `<span style="--k:${i}"><b>${i + 1}</b>${n}</span>`).join('')}</div>
      <div class="fdj-card"><span class="fd-tag">React 18 · flashcard</span><b>What does startTransition do?</b></div></div>` },
  { k: 'coach', name: 'AI coach', line: 'Ask anything about your prep, get a straight answer.', pts: ['Grades your answers honestly', 'Explains with your stack’s examples', 'Stays on interview prep'],
    demo: () => `<div class="fd fd-coach">
      <div class="fdm fdm-you">Grade my answer: “indexes always make queries faster.”</div>
      <div class="fdm fdm-dots"><i></i><i></i><i></i></div>
      <div class="fdm fdm-ai"><b>Weak.</b> Indexes speed up reads but slow writes, and won’t help low-selectivity columns or <code>LIKE '%x'</code>. Say when you’d skip one.</div></div>` },
  { k: 'progress', name: 'Readiness map', line: 'See what’s solid and what’s shaky, at a glance.', pts: ['Every topic, scored as you go', 'Daily target and streak', 'Knows your interview date'],
    demo: () => `<div class="fd fd-prog">
      <div class="fdp-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5"/><circle class="fdp-arc" cx="18" cy="18" r="15.5"/></svg><b>72%</b><span>ready</span></div>
      <div class="fdp-tiles">${['Java', 'Spring', 'SQL', 'Kafka', 'AWS', 'Docker', 'System design', 'Behavioral'].map((n, i) => `<span class="fdp-t s${[3, 3, 2, 1, 2, 0, 1, 3][i]}" style="--k:${i}">${n}</span>`).join('')}</div></div>` },
];
let featTimer = null;
function featHtml(i) {
  const f = FEATURES[i];
  return `<div class="lf-demo" data-k="${f.k}">${f.demo()}</div>
    <div class="lf-copy"><h3>${esc(f.name)}${f.pro ? ' <span class="tag">Pro</span>' : ''}</h3><p>${esc(f.line)}</p>${ticks(f.pts)}</div>`;
}
function featuresHtml() {
  const i = S.feat || 0;
  return `<section class="l-feat" aria-label="What you get">
    <p class="l-tag">## what you get</p>
    <h2 class="l-h2">Everything you need for the interview. Nothing you don’t.</h2>
    <div class="lf-tabs" role="tablist">${FEATURES.map((f, j) => `<button class="lf-tab ${j === i ? 'on' : ''}" role="tab" aria-selected="${j === i}" data-act="feat" data-i="${j}"><span>${esc(f.name)}</span><i class="lf-prog"></i></button>`).join('')}</div>
    <div class="lf-stage" id="lfStage">${featHtml(i)}</div>
  </section>`;
}
function showFeat(i, user) {
  S.feat = (i + FEATURES.length) % FEATURES.length;
  const st = document.getElementById('lfStage');
  if (!st) return stopFeat();
  st.innerHTML = featHtml(S.feat);
  document.querySelectorAll('.lf-tab').forEach((b, j) => { b.classList.toggle('on', j === S.feat); b.setAttribute('aria-selected', String(j === S.feat)); b.classList.remove('run'); void b.offsetWidth; if (j === S.feat) b.classList.add('run'); });
  if (user) startFeat();
}
function startFeat() {
  stopFeat();
  if (!document.getElementById('lfStage')) return;
  document.querySelector('.lf-tab.on')?.classList.add('run');
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  featTimer = setInterval(() => showFeat((S.feat || 0) + 1), 6000);
}
function stopFeat() { clearInterval(featTimer); featTimer = null; }
function planCompare() {
  const o = offer();
  return `<section class="l-plans" aria-label="Free and Pro">
    <p class="l-tag">## pricing</p>
    <h2 class="l-h2">Start free. Go Pro for the interview week.</h2>
    <div class="lp-grid">
      <div class="lp-col"><b>Free</b><span class="lp-price">$0</span>${ticks(['Your plan and core topics', 'Flashcards that bring misses back', `${o.freeMsgs} AI coach messages to try`, 'Readiness map'])}</div>
      <div class="lp-col pro"><b>Pro</b><span class="lp-price">${esc(o.proPrice)}</span>${ticks(['Every topic and diagram', 'Unlimited AI coach', 'Role Ready: decks for any job post or role', `${o.proLive} Live AI minutes a month, used only while you talk`])}</div>
    </div>
    <div class="row" style="justify-content:center"><button class="btn primary lg" data-act="startonboard">Get started, it’s free</button></div>
  </section>`;
}

// The app, shown the way it moves: short silent loops of real screens (recorded from the app itself).
function movesHtml() {
  const clip = (f, name, meta) => `<figure class="mv-item">
    <div class="mv-frame"><video src="media/${f}.mp4" poster="media/${f}.jpg" muted loop playsinline autoplay preload="metadata" aria-label="${esc(name)}"></video></div>
    <figcaption><b>${esc(name)}</b><span class="mv-meta">${esc(meta)}</span></figcaption></figure>`;
  return `<section class="l-moves" aria-label="The app in motion">
    <div class="mv-head"><h2 class="mv-title">See it move.</h2><span class="mv-meta">PrepPilot · iPhone and web</span></div>
    <p class="mv-sub">Real screens from the app, not mock-ups.</p>
    <div class="mv-row">
      ${clip('swipe', 'Swipe cards', 'Flashcards · right if you know it')}
      ${clip('role', 'Role Ready', 'Type a role · 25 cards · basics to scenarios')}
      ${clip('learn', 'Why · Example · Trap', 'Every answer explained')}
    </div>
  </section>`;
}

function landingView() {
  const demo = S.demo;
  const q = demo?.q;
  return `<div class="landing">
    <section class="l-hero">
      <div class="l-copy">
        ${!signedIn() ? `<aside class="l-pitch" aria-label="Short cards instead of long videos">
          <div class="pz" aria-hidden="true">
            <div class="pz-video">
              <span class="pz-play">${ic('play')}</span>
              <span class="pz-meta"><b>Java Collections, lecture 14 of 62</b><i class="pz-bar"><em></em></i></span>
              <span class="pz-time">2:47:10</span>
            </div>
            <div class="pz-cards">
              <span class="pz-card" style="--k:0"><code>hashCode()</code></span>
              <span class="pz-card" style="--k:1"><code>equals()</code></span>
              <span class="pz-card" style="--k:2"><code>load 0.75</code></span>
              <span class="pz-clock">90 sec</span>
            </div>
          </div>
          <strong>Three hours of video, or ninety seconds of cards.</strong>
          <p>You learned it once already. Skip re-watching the course and get the parts interviewers ask about back on the tip of your tongue.</p>
        </aside>` : ''}
        <p class="l-tag">## interview prep, the short way</p>
        <h1 class="l-title">Your interview is coming up. Let’s make sure it all comes back to you.</h1>
        <p class="l-sub">Quick flashcards for the tech you already work with, Java, React, Python, SQL, cloud and AI, one or two lines each, in the order you actually work.</p>

      </div>
      ${heroAnim()}
      <p class="l-giant" aria-hidden="true">recall<span class="l-giant-dot"></span></p>
    </section>
    ${movesHtml()}
    ${LANDING_V2 ? featuresHtml() : ''}
    ${storyHtml()}
    ${storyCta()}

    <section class="l-try">
      <p class="l-tag">## try one yourself</p>
      <h2 class="l-h2">Try a card</h2>
      <div class="chips l-lanes" role="tablist" aria-label="Pick a technology">${LANES.map(([n], i) => `<button class="chip ${demo?.lane === i ? 'on' : ''}" role="tab" aria-selected="${demo?.lane === i}" data-act="demolane" data-i="${i}">${esc(n)}</button>`).join('')}</div>
      ${q ? `<article class="card stacked flash l-card" id="flash">
        <div class="card-head"><span>${esc(demo.topicName)}</span><button class="link quiet small" data-act="demoshuffle">Another one</button></div>
        <p class="q">${fmt(q.q)}</p>
        ${demo.reveal ? `<div class="ans">${fmt(q.a)}</div>` : ''}
        <div class="foot">${demo.reveal ? '<p class="muted small">Knew it? In the app you tap Got it. Didn’t? It comes back first next time.</p>' : '<button class="btn primary block" data-act="demoreveal">Show the answer</button>'}</div>
      </article>` : '<p class="muted">Loading a card…</p>'}
    </section>

    <section class="l-jf" aria-label="Role Ready">
      <p class="l-tag">## role ready <span class="tag">Pro</span></p>
      <h2 class="l-h2">Paste the job. Get the top 5 skills, with flashcards.</h2>
      <p class="muted">We read the requirements, pick the top 5 skills it will test, with flashcards for each. A cheat sheet for this one interview, not another course.</p>
      <div class="jfa" aria-hidden="true">
        <div class="jfa-post">
          <p class="jfa-h">Senior Backend Engineer</p>
          <p>You will build services in <mark style="--k:0">Java 17</mark> on <mark style="--k:1">Spring Boot</mark>, stream events through <mark style="--k:2">Kafka</mark>, model data in <mark style="--k:3">PostgreSQL</mark> and deploy on <mark style="--k:4">AWS</mark>. Experience with on-call and code review.</p>
        </div>
        <div class="jfa-chips">${['Java 17', 'Spring Boot', 'Kafka', 'PostgreSQL', 'AWS'].map((n, i) => `<span class="jfa-chip" style="--k:${i}"><b>${i + 1}</b>${n}</span>`).join('')}</div>
        <div class="jfa-card"><span class="jfa-t">Kafka · flashcard</span><b>How do you keep order for one customer?</b><span>Key messages by customer ID: same key, same partition, order kept.</span></div>
      </div>
    </section>

    ${newsHtml(false)}
    <section class="l-why">
      <p class="l-tag">## why it works</p>
      <h2 class="l-h2">Built for the night before, not a semester</h2>
      <div class="l-grid">
        <div class="l-tile">${ic('cards')}<b>Short on purpose</b><span>Not a course. Each card is the line you want ready when the interviewer asks.</span></div>
        <div class="l-tile">${ic('right')}<b>In your workflow’s order</b><span>Write it, build it, test it, ship it, run it. The next card is the one you’d expect.</span></div>
        <div class="l-tile">${ic('refresh')}<b>Misses come back</b><span>Cards you get wrong return first, so the weak spots get the time.</span></div>
        <div class="l-tile">${ic('mic')}<b>Say it out loud</b><span>Practise answers by voice, or book a full hour with Live AI before the big day.</span></div>
      </div>
    </section>

    ${LANDING_V2 ? planCompare() : ''}
    <section class="l-end">
      <h2 class="l-h2">Pick your role and start</h2>
      <p class="muted">Search ${getCatalog().roles.length} roles, or paste a few lines about your experience and we’ll pick for you.</p>
      <p class="small"><a href="/questions/">Browse 1,200+ interview questions by topic</a></p>
      <div class="row" style="justify-content:center"><button class="btn primary lg" data-act="startonboard">Get started, it’s free</button></div>
    </section>
  </div>`;
}
// A real beginner-friendly card from a popular technology.
async function loadDemo(lane) {
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const li = Number.isInteger(lane) ? lane : Number.isInteger(S.demo?.lane) ? S.demo.lane : Math.floor(Math.random() * LANES.length);
  const ids = LANES[li][1];
  try { await ensureTopics(ids); } catch { return; }
  const pool = ids.map(topicById).filter(Boolean).flatMap(t => t.qa.filter(q => q.l === 1).map(q => ({ t, q })));
  if (!pool.length) return;
  let c = pick(pool);
  for (let k = 0; k < 4 && pool.length > 1 && c.q.q === S.demo?.q?.q; k++) c = pick(pool);
  S.demo = { lane: li, topicName: c.t.name, q: c.q, reveal: false };
  if (S.lastView === 'landing') render(); // refresh whenever the landing page is showing, with or without a saved profile
}

function welcome() {
  return `<section class="head" style="padding:18px 0 26px">
    <h1>Prepare for the interview you actually have.</h1>
    <p class="lede" style="margin-top:12px">Tell PrepPilot your role. It puts the topics in the order that matters, drills you on what you miss, and listens while you practise your answers out loud.</p>
  </section>`;
}

function onboardingView(existing) {
  S.draft ||= migrateProfile(existing || { roleIds: [], level: 'mid', strong: [], weak: [], extras: [] });
  const d = S.draft;
  const cat = getCatalog();
  const roles = effectiveRoles(d).map(roleById).filter(Boolean);
  const chosen = d.roleIds.length && (!d.roleIds.includes('other') || d.baseRoleId);
  const rate = id => (d.strong?.includes(id) ? 'strong' : d.weak?.includes(id) ? 'weak' : '');
  const core = [...new Set(roles.flatMap(role => Object.entries(role.topics).filter(([, w]) => w === 3).map(([id]) => id)))];
  const extras = [...new Set(roles.flatMap(role => role.extras || []))];
  const roleBtn = r => `<button type="button" class="chip ${d.roleIds.includes(r.id) ? 'on' : ''}" aria-pressed="${d.roleIds.includes(r.id)}" data-act="pickrole" data-id="${r.id}" data-search="${esc((r.name + ' ' + (r.keywords || '')).toLowerCase())}">${esc(r.name)}</button>`;
  const step = (n, body) => `<div class="step"><div class="n">${n}</div><div class="stack">${body}</div></div>`;
  return `
  <form class="stack" id="profileForm" style="gap:26px">
    ${existing ? '<div class="head"><h2>Your prep profile</h2><p class="muted">Saving rebuilds your plan. This stays on your device.</p></div>' : ''}
    ${step(1, `<fieldset class="stack"><legend>What are you interviewing for?</legend>
      ${d.roleIds.length ? `<div class="chips picked">${d.roleIds.map(id => `<button type="button" class="chip on" data-act="pickrole" data-id="${esc(id)}" aria-label="Remove ${esc(id === 'other' ? 'Other' : roleById(id)?.name || id)}">${esc(id === 'other' ? (d.otherRole || 'Other') : roleById(id)?.name || id)} ${ic('x')}</button>`).join('')}</div>` : ''}
      <div class="seg" role="tablist" aria-label="How to choose">
        <button type="button" role="tab" aria-selected="${S.pickMode !== 'paste'}" data-act="pickmode" data-m="search">Search roles</button>
        <button type="button" role="tab" aria-selected="${S.pickMode === 'paste'}" data-act="pickmode" data-m="paste">Paste my experience</button>
      </div>
      ${S.pickMode === 'paste' ? `<div class="stack tight">
        <textarea id="expSummary" rows="5" maxlength="1500" placeholder="Paste your résumé summary or a few lines about your experience: years, main languages, cloud, tools. Leave out project details and anything private.">${esc(S.expSummary || '')}</textarea>
        <div class="row"><button type="button" class="btn" data-act="suggestroles" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Reading it…' : 'Suggest my roles'}</button><span class="muted small">Picks your roles and level. Uses 1 AI message.</span></div>
      </div>` : `<input id="roleSearch" value="${esc(S.roleSearch)}" placeholder="Type a role or a tech: java, react, kubernetes, spark" autocomplete="off" aria-label="Search roles">
      <details class="allroles" ${S.roleSearch ? 'open' : ''}><summary class="muted" style="font-weight:500">${S.roleSearch ? 'Matching roles' : 'Or browse all roles'}</summary>
      <div class="stack" style="margin-top:12px">
      ${cat.families.map(f => `<div class="rolefam"><div class="label">${esc(f.name)}</div><div class="chips">${cat.roles.filter(r => r.family === f.id).map(roleBtn).join('')}</div></div>`).join('')}
      <div class="chips"><button type="button" class="chip ${d.roleIds.includes('other') ? 'on' : ''}" aria-pressed="${d.roleIds.includes('other')}" data-act="pickrole" data-id="other" data-search="other not listed">Other / not listed</button></div>
      </div></details>`}
      ${d.roleIds.length > 1 ? '<p class="note" role="status">Your plan will combine these roles. You can still practice one role at a time from the plan.</p>' : ''}
      ${d.roleIds.includes('other') ? `<label>Your role<input name="otherRole" maxlength="60" value="${esc(d.otherRole || '')}" placeholder="e.g. Salesforce developer" required></label>
        <label>Closest role above (picks your starter topics)<select name="baseRoleId" data-act="baserole" required><option value="">Choose…</option>${cat.roles.map(r => `<option value="${r.id}" ${d.baseRoleId === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></label>` : ''}
    </fieldset>`)}
    ${chosen ? `
    ${step(2, `<fieldset class="stack"><legend>About you</legend>
      <label>Experience<select name="level">${LEVELS.map(l => `<option value="${l.id}" ${d.level === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <label>Your background, in a line or two<textarea name="background" rows="3" maxlength="600" placeholder="e.g. 4 years of Java microservices, some AWS">${esc(d.background || '')}</textarea></label>
      <label>What you're aiming for<input name="goal" maxlength="200" value="${esc(d.goal || '')}" placeholder="e.g. Senior backend roles at product companies"></label>
      ${extras.length ? `<div class="stack tight"><span style="font-weight:600;font-size:14px">Other tech you use</span>
        <div class="chips">${extras.map(id => `<button type="button" class="chip extra ${d.extras?.includes(id) ? 'on' : ''}" data-act="extra" data-id="${id}">${esc(topicName(id))}</button>`).join('')}</div></div>` : ''}
    </fieldset>`)}
    ${step(3, `<fieldset class="stack"><legend>Where do you stand on the core topics?</legend>
      <p class="muted small" style="margin-top:-6px">Tap a topic once for strong, twice for weak. Weak topics are studied first.</p>
      <div class="chips">${core.map(id => `<button type="button" class="chip rate ${rate(id)}" data-act="rate" data-id="${id}">${esc(topicName(id))}</button>`).join('')}</div>
    </fieldset>`)}
    <button class="btn primary lg block" type="submit">${existing ? 'Save profile' : 'Build my plan'}</button>` : ''}
  </form>`;
}

async function suggestRoles() {
  const el = document.getElementById('expSummary');
  const text = (el?.value || '').trim();
  S.expSummary = text;
  if (text.length < 40) return oops('Paste a few lines: years of experience, main languages, cloud and tools.');
  captureDraft();
  if (!signedIn()) { sheet(signInCard('Sign in so the AI can read it')); return mountGoogleButton(); }
  S.busy = true; render();
  try {
    const r = await ai.post('/api/profile/suggest', { summary: text });
    const ids = (r.roleIds || []).filter(id => roleById(id));
    if (!ids.length) throw new Error('Could not match that to a role. Try searching instead.');
    S.draft.roleIds = [...new Set([...S.draft.roleIds.filter(id => id !== 'other'), ...ids])];
    if (r.level) S.draft.level = r.level;
    if (!S.draft.background) S.draft.background = text.slice(0, 600);
    S.pickMode = 'search';
    toast(`Picked ${ids.map(id => roleById(id).name).join(', ')}. Change anything below.`);
  } catch (e) { aiFailed(e); }
  S.busy = false; render();
}

async function saveProfile() {
  S.editProfile = false;
  captureDraft();
  const d = S.draft;
  if (!d?.roleIds.length || (d.roleIds.includes('other') && (!d.baseRoleId || !d.otherRole))) return oops('Choose a role, and fill in the details if you picked "Other".');
  const prev = profile();
  const before = new Set(prev ? rankTopics(topics(), prev).map(t => t.id) : []);
  const p = { ...d, roleId: d.roleIds[0], planStart: prev?.planStart || Date.now() };
  if (!p.roleIds.includes('other')) { delete p.otherRole; delete p.baseRoleId; }
  const roles = effectiveRoles(p).map(roleById).filter(Boolean);
  p.extras = (p.extras || []).filter(id => roles.some(role => role.extras?.includes(id)));
  p.strong = (p.strong || []).filter(id => roles.some(role => role.topics?.[id]));
  p.weak = (p.weak || []).filter(id => roles.some(role => role.topics?.[id]));
  store.setProfile(p);
  if (!signedIn()) lsSet('pp.profileGuest', '1'); // set up while signed out: an account's saved profile wins at sign-in
  S.flushUserData?.(); // a new or changed profile goes to the account right away
  S.draft = null;
  if (p.roleIds.includes('other') && p.otherRole !== prev?.otherRole) ai.reportRole(p.otherRole).catch(() => {});
  app.innerHTML = '<p class="muted">Building your plan…</p>';
  try { await ensureForProfile(p); } catch { oops('Could not download your topics. Check your connection.'); }
  if (prev) {
    // Tell them what the change added, on Home.
    const added = rankTopics(topics(), p).filter(t => !before.has(t.id));
    const newRoles = p.roleIds.filter(id => !(prev.roleIds || []).includes(id)).map(id => id === 'other' ? p.otherRole : roleName(id)).filter(Boolean);
    if (added.length) lsSet('pp.newTopics', JSON.stringify({ ids: added.map(t => t.id), roles: newRoles, at: Date.now() }));
    else toast('Profile saved. Your plan is updated.');
  }
  S.view = 'home'; render();
}

/* ---------- views ---------- */
function livePromo() {
  if (isAdmin()) return `<section class="card stacked live-hero" aria-label="Live AI"><div class="card-head"><span>Live AI</span><span>Admin, no limits</span></div><h2>Live AI</h2><p style="margin-top:8px">Practice test, open conversation or interview mode, as long as you like.</p><div class="row" style="margin-top:18px"><button class="btn invert lg" data-act="livesetup">Start Live AI</button></div></section>`;
  const { credits, left } = liveState();
  const o = offer();
  const isProUser = store.account()?.plan === 'pro' && !credits && left < 20;
  const iv = S.liveInterviewIos; // "During your interview" mode, server-gated (default off).
  const [head, title, text, cta] = left >= 20
    ? ['Session in progress', 'Your practice test is still open', `${Math.ceil(left / 60)} minutes left. Rejoin and pick up where you stopped.`, '<button class="btn invert lg" data-act="livesetup">Rejoin the session</button>']
    : credits
      ? [`${credits} session${credits > 1 ? 's' : ''} ready`, 'Live AI is ready when you are', iv ? 'Use it for a spoken practice test, or keep it listening during your real interview for talking points on screen.' : 'Use it for a spoken practice test, or an open conversation with AI.', '<button class="btn invert lg" data-act="livesetup">Start the practice test</button>']
      : (store.account()?.plan === 'pro') ? [`${store.account()?.proLiveLeft ?? o.proLive} of ${o.proLive} min left this month`, `Live AI, ${o.proLive} minutes a month`, iv ? 'A spoken practice test, an open conversation, or talking points during your interview, without a break. For a full hour, add a one-time session.' : 'A spoken practice test or an open conversation, without a break. For a full hour, add a one-time session.', '<button class="btn invert lg" data-act="livesetup">Start Live AI</button>']
      : [`${o.liveMin} minutes, one-time`, 'Live AI for 60 minutes', iv ? 'Run a spoken practice test the day before. Then, in the interview itself, leave it listening: a few talking points appear on screen as each question is asked.' : 'Run a spoken practice test the day before, or an open conversation to warm up.', '<button class="btn invert lg" data-act="plans">See pricing</button>'];
  return `<section class="card stacked live-hero" aria-label="Live AI">
    <div class="card-head"><span>${isProUser ? `Live AI, ${o.proLive} min a month` : `Live AI, ${o.liveMin} minutes`}</span><span>${esc(head)}</span></div>
    <h2>${esc(title)}</h2>
    <p style="margin-top:8px">${esc(text)}</p>
    <ul class="live-points"><li>Practice test with a verdict</li>${iv ? '<li>Talking points during your interview</li>' : ''}<li>${isProUser ? 'Only the minutes you talk are counted' : 'One 60-minute clock: it keeps running once you start'}</li></ul>
    <div class="row" style="margin-top:18px">${cta}</div>
  </section>`;
}

// One real card from the user's own stack, different each time, answerable in place.
function quickCard(relevant) {
  const open = relevant.filter(t => !isLocked(t.id) && t.qa.length && !['behavioral', 'scenarios'].includes(t.id));
  if (!open.length) return '';
  if (!S.qc || !open.some(t => t.id === S.qc.topic)) {
    const t = open[Math.floor(Math.random() * open.length)];
    const tiers = LEVELS.find(l => l.id === profile()?.level)?.tiers || [1, 2, 3];
    const pool = t.qa.map((q, i) => [q, i]).filter(([q]) => tiers.includes(q.l));
    const [, i] = (pool.length ? pool : t.qa.map((q, k) => [q, k]))[Math.floor(Math.random() * (pool.length || t.qa.length))];
    S.qc = { topic: t.id, i, reveal: false };
  }
  const t = topicById(S.qc.topic), q = t.qa[S.qc.i];
  return `<section class="card stacked flash" style="min-height:0">
    <div class="card-head"><span>Quick card: ${esc(t.name)}</span><button class="link quiet small" data-act="qcnext">Another</button></div>
    <p class="q">${fmt(q.q)}</p>
    ${S.qc.reveal ? `<div class="ans">${fmt(q.a)}</div>${learnHtml(q)}` : ''}
    <div class="foot">${S.qc.reveal ? '<div class="row"><button class="btn" data-act="qcnext">Another card</button></div>' : '<button class="btn block" data-act="qcreveal">Show the answer</button>'}</div>
  </section>`;
}

/* ---------- Home search: "What do you want to learn today?" ---------- */
// Everyday names people type, mapped to words in our topic names and ids.
const LS_SYN = { js: 'javascript', ts: 'typescript', k8s: 'kubernetes', kube: 'kubernetes', py: 'python', golang: 'go', 'c#': 'csharp', csharp: 'c#', dotnet: '.net', '.net': 'dotnet', node: 'node', nodejs: 'node', db: 'sql', database: 'sql', databases: 'sql', postgres: 'sql', mysql: 'sql', ml: 'machine learning', ai: 'llm', genai: 'llm', llms: 'llm', rag: 'llm', aws: 'cloud', azure: 'cloud', gcp: 'cloud', devops: 'cicd', 'ci/cd': 'cicd', ci: 'cicd', algo: 'algorithms', algorithms: 'dsa', dsa: 'algorithms', 'system design': 'system-design', sd: 'system design', oop: 'design patterns', kafka: 'streaming', spark: 'spark', hr: 'behavioral', behaviour: 'behavioral', star: 'behavioral', testing: 'testing', qa: 'test', selenium: 'selenium', playwright: 'playwright', react: 'react', angular: 'angular', spring: 'spring', 'spring boot': 'spring', docker: 'docker', linux: 'linux', git: 'git' };
const lsNorm = x => String(x || '').toLowerCase().trim();
function lsSearch(q) {
  q = lsNorm(q);
  if (q.length < 2) return [];
  const terms = [q, LS_SYN[q]].filter(Boolean);
  const mine = new Set(rankTopics(topics(), profile()).map(t => t.id));
  const out = [];
  for (const pk of getManifest().packs) for (const t of pk.topics) {
    if (t.private) continue;
    // Whole words only, so "java" finds Java topics and not JavaScript.
    const words = x => lsNorm(x).split(/[^a-z0-9#.+]+/).filter(Boolean);
    const nameW = words(t.name), idW = t.id.split('-'), packW = words(pk.name), blurbW = words(t.blurb);
    const name = lsNorm(t.name);
    let sc = 0;
    for (const w of terms) {
      const multi = w.includes(' ');
      if (t.id === w || name === w || (multi ? name.includes(w) : nameW.includes(w) || idW.includes(w))) sc = Math.max(sc, 5);
      else if (multi ? lsNorm(pk.name).includes(w) : packW.includes(w)) sc = Math.max(sc, 4);
      else if (!multi && w.length >= 3 && nameW.some(x => x.startsWith(w) && x.length - w.length <= 2)) sc = Math.max(sc, 3); // plurals, "kube"
      else if (multi ? lsNorm(t.blurb).includes(w) : blurbW.includes(w)) sc = Math.max(sc, 1.5);
    }
    if (sc) out.push({ id: t.id, name: t.name, blurb: t.blurb, pack: pk.name, score: sc + (mine.has(t.id) ? 0.5 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 6);
}
// Shown when the search box is focused and empty: fresh questions and the field decks.
function lsPicksHtml() {
  const n = newCards().length;
  const has = k => fieldCards(k).length;
  const picks = [
    n ? ['newdeck', '', 'spark', `New this month`, `${n} fresh question${n === 1 ? '' : 's'} from what developers are hitting now`] : null,
    has('trouble') ? ['fielddeck', 'trouble', 'alert', 'Troubleshooting', 'Real errors, the cause and the fix'] : null,
    has('scenarios') ? ['fielddeck', 'scenarios', 'target', 'Real scenarios', 'What interviewers ask about actual work'] : null,
    has('terms') ? ['fielddeck', 'terms', 'book', 'Terminology', 'The words you will hear'] : null,
  ].filter(Boolean);
  if (!picks.length) return '';
  return `<div class="ls-picks"><span class="muted small">Quick picks</span>${picks.map(([act, k, icon, t, d]) => `<button class="ls-item" data-act="${act}" data-k="${k}" data-v="${k}">${ic(icon)}<span class="main"><b>${t}</b><span>${esc(d)}</span></span>${hasPro() || act !== 'fielddeck' ? ic('right') : '<span class="tag">Pro</span>'}</button>`).join('')}</div>`;
}
// Questions added by the daily refresh (marked with the month), from the user's own topics.
function newCards() {
  const since = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 7);
  return rankTopics(topics(), profile()).flatMap(t => t.qa.map((q, i) => ({ id: `${t.id}-${i}`, topic: t.id, ...q, box: store.progress()[`${t.id}-${i}`]?.box ?? 0 })).filter(q => q.new && q.new >= since));
}
function startNewDeck() {
  const cards = newCards();
  if (!cards.length) return oops('No new questions in your topics yet. Check back tomorrow.');
  S.lsLabel = 'New this month'; S.swStreak = 0;
  S.deck = { cards: interviewRound(cards, { mix: deckMode() === 'swipe', limit: 20 }), results: [], free: false, total: cards.length, mode: deckMode(), ids: null };
  S.di = 0; S.reveal = false; S.view = 'deck'; render();
}
// A question rather than a topic name: offer the AI coach first.
const looksLikeQuestion = q => /\?\s*$/.test(q) || /^(what|how|why|when|which|who|explain|difference|can|should|is|are|does|do|tell|give|compare|help)\b/i.test(q.trim()) || q.trim().split(/\s+/).length >= 5;
const askRow = q => `<button class="ls-item ls-ask" data-act="askai" data-q="${esc(q)}">${ic('spark')}<span class="main"><b>Ask the AI coach</b><span>“${esc(q)}”</span></span>${ic('right')}</button>`;
function lsResultsHtml(q) {
  if (lsNorm(q).length < 2) return lsPicksHtml();
  const r = lsSearch(q);
  if (looksLikeQuestion(q)) return `<div class="ls-list" role="listbox">${askRow(q)}${r.slice(0, 3).map(t => `<button class="ls-item" role="option" data-act="lsgo" data-id="${t.id}"><span class="main"><b>${esc(t.name)} flashcards</b><span>${esc(t.pack)}</span></span>${isLocked(t.id) ? '<span class="tag">Pro</span>' : ic('right')}</button>`).join('')}</div>`;
  if (!r.length) return `<div class="ls-list" role="listbox">${askRow(q)}</div><p class="muted small" style="margin:0">No flashcards on “${esc(q)}” yet.</p>`;
  return `<div class="ls-list" role="listbox">${r.map(t => `<button class="ls-item" role="option" data-act="lsgo" data-id="${t.id}">
    <span class="main"><b>${esc(t.name)}</b><span>${esc(t.pack)}${t.blurb ? ` · ${esc(t.blurb)}` : ''}</span></span>${isLocked(t.id) ? '<span class="tag">Pro</span>' : ic('right')}</button>`).join('')}</div>`;
}
// Start a round on what they searched: their level from the profile, easy to hard, in their chosen mode.
async function lsStart(ids, label) {
  if (!ids.length) return;
  const open = ids.filter(id => !isLocked(id));
  if (!open.length) { S.showPlans = true; return render(); }
  try { await ensureTopics(open); } catch { return oops('Could not download those cards. Check your connection.'); }
  S.lsLabel = label || '';
  startDeck(open);
}
// 'Swipe another mix' after a search keeps the search label; any other deck clears it.
const d0label = id => (id && S.deck?.ids && id === S.deck.ids.join(',') ? S.lsLabel : '');
function learnSearchHtml(p) {
  const mine = rankTopics(topics(), p).filter(t => !t.custom && !t.private).slice(0, 6);
  return `<section class="ls">
    <h1 class="ls-title">What do you want to learn today?</h1>
    <form id="learnForm" class="ls-box" role="search">
      ${ic('search')}<input id="learnSearch" type="search" enterkeyhint="go" autocomplete="off" placeholder="A topic, or ask a question" aria-label="What do you want to learn today?" value="${esc(S.lsQ || '')}">
      <button class="ls-go" type="submit" aria-label="Start">${ic('right')}</button>
    </form>
    <div id="lsResults">${lsResultsHtml(S.lsQ || '')}</div>
  </section>`;
}

// Tips: one at a time on Home, each shown until "Got it". Only tips that fit this device.
const TIPS = [
  { id: 'float', when: () => pipSupport() && !native(), t: 'Cards float over your other apps', d: 'Your first click opens a small card window that stays on top of Outlook, Teams or your editor. It moves to the next card by itself.', act: 'popout', btn: 'Try it now' },
  { id: 'swipe', when: () => true, t: 'Swipe right on what you know', d: 'In swipe mode, right means you know it, left brings it back sooner, up means you know it cold.', act: 'deck', btn: 'Open cards' },
  { id: 'wet', when: () => true, t: 'Every answer has a Why', d: 'Flip a card and tap Why · Example · Trap to see how it works, a real example and the mistake interviewers listen for.' },
  { id: 'role', when: () => true, t: 'Type any role to get its decks', d: 'Role Ready builds about 25 cards for a role, or decks from a pasted job post.', act: 'jobfocus', btn: 'Open Role Ready' },
  { id: 'lab', when: () => true, t: 'Worked answers in Interview Lab', d: 'System design, coding, SQL and more: try it yourself first, get it checked, then see the strong answer.', act: 'lab', btn: 'Open Interview Lab' },
  { id: 'live', when: () => true, t: 'Pause Live AI any time', d: 'Pause stops your minutes. Locking the phone pauses it for you, and Resume carries on the same conversation.' },
  { id: 'drawer', when: () => window.innerWidth < 900, t: 'Swipe right for the menu', d: 'Swipe right anywhere to open the side panel with your chats and every section.' },
  { id: 'keys', when: () => !native() && window.innerWidth >= 900, t: 'Keyboard shortcuts', d: 'On cards: Space flips, the arrow keys answer. In the floating window: P pauses.' },
];
function tipHtml() {
  let seen; try { seen = JSON.parse(lsGet('pp.tipsSeen', '[]')); } catch { seen = []; }
  const tip = TIPS.find(t => !seen.includes(t.id) && t.when());
  if (!tip) return '';
  return `<section class="tip"><span class="tip-ic">${ic('bulb')}</span><div><span class="mv-meta">Tip</span><b>${esc(tip.t)}</b><span class="muted small">${esc(tip.d)}</span>
    <div class="row">${tip.act ? `<button class="btn small primary" data-act="tipgo" data-id="${tip.id}">${esc(tip.btn)}</button>` : ''}<button class="btn small quiet" data-act="tipok" data-id="${tip.id}">Got it</button></div></div></section>`;
}
function tipSeen(id) { let seen; try { seen = JSON.parse(lsGet('pp.tipsSeen', '[]')); } catch { seen = []; } lsSet('pp.tipsSeen', JSON.stringify([...new Set([...seen, id])])); }

function newTopicsNote() {
  let n; try { n = JSON.parse(lsGet('pp.newTopics', 'null')); } catch { n = null; }
  if (!n?.ids?.length) return '';
  const list = n.ids.map(id => topics().find(t => t.id === id)).filter(Boolean);
  if (!list.length) return '';
  const cards = list.reduce((k, t) => k + t.qa.length, 0);
  const first = list.find(t => !isLocked(t.id)) || list[0];
  return `<section class="new-note">
    <div class="nn-top"><span class="nn-ic">${ic('spark')}</span><div><b>${list.length} new topic${list.length > 1 ? 's' : ''} · ${cards} cards added</b><span class="muted small">${n.roles?.length ? `For ${esc(n.roles.join(', '))}. ` : ''}Mixed into your plan below.</span></div>
      <button class="iconbtn plain" data-act="nndismiss" aria-label="Dismiss">${ic('x')}</button></div>
    <div class="chips">${list.slice(0, 8).map(t => `<button class="chip" data-act="learn" data-id="${t.id}">${esc(t.name)}</button>`).join('')}${list.length > 8 ? `<span class="muted small">+${list.length - 8} more</span>` : ''}</div>
    <div class="row"><button class="btn primary" data-act="deck" data-id="${esc(list.filter(t => !isLocked(t.id)).map(t => t.id).join(','))}">${ic('cards')}Practice the new cards</button><button class="btn quiet" data-act="learn" data-id="${first.id}">Start with ${esc(first.name)}</button></div>
  </section>`;
}

// "New in PrepPilot": the same four updates on Home (signed in, with a profile) and on the landing page.
function newsHtml(home) {
  const p = home ? profile() : null;
  const stack = p ? migrateProfile(p).roleIds.map(id => id === 'other' ? p.otherRole : roleName(id)).filter(Boolean)[0] : '';
  const tile = (icon, title, body, act, tag) => home && act
    ? `<button class="l-tile news-tile" data-act="${act}">${ic(icon)}<b>${title}${tag ? ` <span class="tag">${tag}</span>` : ''}</b><span>${body}</span></button>`
    : `<div class="l-tile">${ic(icon)}<b>${title}${tag ? ` <span class="tag">${tag}</span>` : ''}</b><span>${body}</span></div>`;
  return `<section class="${home ? 'news' : 'l-why'}" aria-label="New in PrepPilot">
    ${home ? '<div class="sec-head"><h3>New in PrepPilot</h3></div>' : '<p class="l-tag">## new in preppilot</p><h2 class="l-h2">Fresh this month</h2>'}
    <div class="l-grid news-grid">
      ${tile('book', 'Interview Lab', stack ? `Worked answers for ${esc(stack)} interviews: system design, coding, SQL and behavioral. Try it first, then see the strong answer.` : '82 worked answers: system design, coding, SQL, low-level design and behavioral. Try it first, then see the strong answer.', 'openlab')}
      ${tile('play', '45-second videos', 'Short explainers for every topic and lesson, with a quick question after each one so it sticks.', '', 'Coming soon')}
      ${tile('spark', 'Role Ready', 'Paste a job post or type a role and get the top 5 skills it will test, with flashcards.', 'jobfocus', 'Pro')}
      ${tile('cards', 'Floating cards', 'Keep a card floating over your other apps; it moves to the next one on its own.', pipSupport() ? 'popout' : '')}
    </div>
  </section>`;
}
function homeView() {
  const p = profile();
  const relevant = rankTopics(topics(), p);
  if (!relevant.length) return '<p class="muted">Loading your topics…</p>';
  const prog = store.progress();
  const map = knowledgeMap(relevant, p, prog);
  // Remember this render's map so the next one can highlight tiles that moved up.
  const prevMap = S.prevMap;
  S.prevMap = Object.fromEntries(map.topics.map(t => [t.id, t.state]));
  const knownTotal = map.topics.reduce((n, t) => n + t.known, 0);
  const cardsTotal = map.topics.reduce((n, t) => n + t.total, 0);
  // Only cards seen before count as due; a new user is not 'behind' on 254 cards.
  const due = dueCards(topics(), p, prog, Date.now(), 999).filter(c => prog[c.id]).length;
  const mine = new Set(relevant.map(t => t.id));
  const others = getManifest().packs.map(pk => ({ ...pk, topics: pk.topics.filter(t => !mine.has(t.id)) })).filter(pk => pk.topics.length);
  const roleIds = migrateProfile(p).roleIds;
  const label = id => id === 'other' ? p.otherRole : roleName(id);
  const nt = nextTopic(p);
  const ntr = nt ? readiness([nt], p, prog) : null;
  const started = ntr && Object.keys(prog).some(k => k.startsWith(nt.id + '-'));
  const nextHint = nt ? `${nt.concepts.length} short lesson${nt.concepts.length === 1 ? '' : 's'} and ${nt.qa.length} interview question${nt.qa.length === 1 ? '' : 's'}.${started ? ` You know ${ntr.known} of ${ntr.total} so far.` : ''}` : '';
  const lockMark = id => isLocked(id) ? `<span class="lockmark" aria-label="Pro">${ic('lock')}</span>` : '';
  const topicRow = t => {
    const tr = readiness([t], p, prog);
    return `<button class="rowi ${isLocked(t.id) ? 'is-locked' : ''}" data-act="learn" data-id="${t.id}">
      <span class="main"><span class="t">${esc(t.name)}${lockMark(t.id)}</span><span class="d">${esc(t.blurb || '')}</span></span>
      ${isLocked(t.id) ? '<span class="tag">Pro</span>' : tr.total ? `<span class="pct"><span>${tr.pct}%</span><span class="bar"><i style="width:${tr.pct}%"></i></span></span>` : ''}</button>`;
  };
  const lockedCount = relevant.filter(t => isLocked(t.id)).length;
  const lockedCards = relevant.filter(t => isLocked(t.id)).reduce((n, t) => n + t.qa.length, 0);
  return `<div class="stack loose">
    ${learnSearchHtml(p)}
    ${newTopicsNote()}
    ${tipHtml()}
    <div class="curated-head"><h2>Curated for you</h2><span class="muted small">${esc(roleIds.map(label).join(' and '))}${p.level ? ` · ${esc(p.level)}` : ''}</span></div>
    ${nt ? `<section class="card stacked">
      <div class="card-head"><span>Up next</span>${hasPro() ? '' : `<span>${relevant.length - relevant.filter(t => isLocked(t.id)).length} of ${relevant.length} topics open</span>`}</div>
      <h2>${esc(nt.name)}</h2>
      <p class="muted" style="margin-top:8px">${esc(nextHint)}</p>
      <div class="row" style="margin-top:20px">
        <button class="btn primary" data-act="learn" data-id="${nt.id}">${started ? 'Continue' : 'Start the lesson'}</button>
        <button class="btn" data-act="deck" data-id="${nt.id}">Practice flashcards</button>${pipSupport() ? `<button class="btn quiet" data-act="popout">${ic('cards')}Float over other apps</button>` : ''}
        ${hasPro() ? '' : `<button class="btn quiet" data-act="plans">${ic('lock')}Unlock all ${relevant.length} topics</button>`}
      </div>
    </section>` : ''}
    ${lsGet('pp.swipeTried', '') ? '' : `<section class="sw-promo">
      <div class="sw-promo-cards" aria-hidden="true"><i></i><i></i><i></i></div>
      <div><span class="tag">New</span><b>Swipe right on what you know</b><span class="muted small">Like Tinder, but for your next job. Cards from all your skills, mixed.</span>
      <div class="row"><button class="btn primary" data-act="swipedeck">Try swipe mode</button><button class="link quiet small" data-act="swipenah">Keep steady</button></div></div></section>`}
    ${newsHtml(true)}
    ${jobFocusEntry()}
    ${roleIds.includes('other') ? `<section class="panel stack"><h3>Make it specific to ${esc(p.otherRole)}</h3>
      <p class="muted">Your plan starts from the closest listed role. AI can write topics for your exact role. This uses 5 AI messages.</p>
      <div class="row"><button class="btn" data-act="buildrole" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Writing your guide…' : 'Write my role guide'}</button></div></section>` : ''}
    ${lockedCount ? `<section class="unlock-strip">
      <div><b>${relevant.length - lockedCount} of ${relevant.length} topics open on Free</b><span class="muted small">${lockedCards} more interview questions in Pro.</span></div>
      <button class="btn primary" data-act="plans">Unlock all</button></section>` : ''}
    <section>
      <div class="sec-head"><h3>Your topics</h3><span class="muted small">${knownTotal} of ${cardsTotal} cards known</span></div>
      <div class="rows">${(S.allTopics ? relevant : relevant.slice(0, 6)).map(topicRow).join('')}</div>
      ${relevant.length > 6 ? `<button class="link quiet small" data-act="toggletopics" style="margin-top:10px">${S.allTopics ? 'Show fewer' : `Show all ${relevant.length}`}</button>` : ''}
    </section>
  </div>`;
}

/* ---------- Job focus (Pro): paste a job post, get the 5 skills it will test as quick cards ---------- */
const JF_KEY = 'pp.jobfocus';
const JF_SAMPLE = { role: 'Backend Engineer (example)', sample: true, stack: [
  { name: 'Java 17', why: 'The service code is Java; expect language and collections questions.', cards: [
    { q: 'How does a HashMap find a value?', a: 'It hashes the key to pick a bucket, then compares keys with equals inside it. Average O(1); a crowded bucket becomes a tree, so the worst case is O(log n).' },
    { q: 'What do records give you?', a: 'Immutable data classes with constructor, accessors, equals, hashCode and toString generated. Good for DTOs.' },
    { q: 'Checked vs unchecked exceptions?', a: 'Checked must be declared or caught (IOException). Unchecked extend RuntimeException and signal programming errors.' } ] },
  { name: 'Spring Boot', why: 'Every microservice in the posting runs on it.', cards: [
    { q: 'What does @SpringBootApplication do?', a: 'Combines @Configuration, @EnableAutoConfiguration and @ComponentScan, so beans are found and auto-configured from the classpath.' },
    { q: 'Constructor or field injection?', a: 'Constructor: dependencies are explicit, final and easy to test without Spring.' },
    { q: 'How do you handle errors in a REST API?', a: 'A @RestControllerAdvice with @ExceptionHandler methods mapping exceptions to status codes and a consistent error body.' } ] },
  { name: 'Kafka', why: 'Services talk through events; ordering and delivery come up.', cards: [
    { q: 'How do consumer groups share work?', a: 'Each partition goes to one consumer in the group, so parallelism is capped by the partition count.' },
    { q: 'How do you keep order for one customer?', a: 'Use the customer ID as the message key: same key, same partition, order kept.' },
    { q: 'At-least-once delivery means what for you?', a: 'Duplicates can happen, so consumers must be idempotent, for example by tracking processed IDs.' } ] },
  { name: 'PostgreSQL', why: 'Primary data store; expect indexing and transactions.', cards: [
    { q: 'When does an index not help?', a: 'Low-selectivity columns, functions on the column, or leading wildcards like LIKE \'%x\'.' },
    { q: 'What is MVCC?', a: 'Readers see a snapshot and never block writers; old row versions are cleaned up by VACUUM.' },
    { q: 'How do you find a slow query?', a: 'EXPLAIN ANALYZE to see the plan, look for sequential scans and bad row estimates, then index or rewrite.' } ] },
  { name: 'AWS', why: 'Deploys run there; know the core services.', cards: [
    { q: 'SQS vs SNS?', a: 'SQS is a queue one consumer pulls from; SNS pushes one message to many subscribers. Often SNS fans out into SQS.' },
    { q: 'How do you give a service access to S3?', a: 'An IAM role attached to the task or instance with least-privilege policy; never hard-coded keys.' },
    { q: 'What makes a deploy highly available?', a: 'Multiple availability zones behind a load balancer, health checks and auto scaling.' } ] },
] };
const JOBS_KEY = 'pp.jobs', JOBS_MAX = 30;
function jfAll() {
  try {
    const list = JSON.parse(localStorage.getItem(JOBS_KEY) || 'null');
    if (Array.isArray(list)) return list;
    const old = JSON.parse(localStorage.getItem(JF_KEY) || 'null'); // one saved job from before
    return old ? [{ ...old, id: old.id || 'j0' }] : [];
  } catch { return []; }
}
function jfSaved() { return jfAll()[0] || null; }
function jfSave(d) {
  if (!d || d.sample) return;
  d.id ||= Date.now().toString(36);
  if (!d.text && S.jf?.text) d.text = S.jf.text;
  try { localStorage.setItem(JOBS_KEY, JSON.stringify([d, ...jfAll().filter(x => x.id !== d.id)].slice(0, JOBS_MAX))); } catch { /* storage blocked */ }
}
function jfRemove(id) { try { localStorage.setItem(JOBS_KEY, JSON.stringify(jfAll().filter(x => x.id !== id))); } catch { /* storage blocked */ } }

function jobFocusEntry() {
  return `<section class="jf-entry">
    <span class="jf-ico" aria-hidden="true">${ic('target')}</span>
    <div><b>Role Ready${hasPro() ? '' : ' <span class="tag">Pro</span>'}</b><span class="muted small">Paste a job post or type a role. Get decks for the skills it tests.</span></div>
    <button class="btn" data-act="jobfocus">Open</button></section>`;
}

function jobFocusView() {
  const J = S.jf || (S.jf = { result: jfSaved(), sel: 0, busy: false, text: jfSaved()?.text || '', open: new Set() });
  const pro = hasPro();
  const r = J.result || (pro ? null : JF_SAMPLE);
  const jobs = pro ? jfAll() : [];
  if (pro && r && !jobs.some(j => j.id === r.id)) jobs.unshift(r); // still writing: show it as the current job
  const head = `<div class="row between"><button class="back" data-act="home">${ic('left')}Plan</button><span class="tag">${ic(pro ? 'target' : 'lock')} Pro</span></div>`;
  const switcher = jobs.length ? `<div class="jf-jobs" role="tablist">${jobs.map(j => `<button class="jf-job ${r && j.id === r.id ? 'on' : ''}" data-act="jfopen" data-id="${esc(j.id)}">${esc(j.role || 'Job post')}</button>`).join('')}${r ? `<button class="jf-job add" data-act="jfnew">${ic('plus')}New job</button>` : ''}</div>` : '';
  if (!r) return `<div class="stack jf">${head}${switcher}
    <h1>Role Ready</h1>
    <p class="lede">${J.mode === 'role' ? 'Type any role. We pick the skills its interviews test and build about 25 cards, basics first, real scenarios last.' : 'Paste the job description. We pull out every skill it will test and turn each one into a deck of cards, easiest first.'}</p>
    <div class="pf-seg jf-mode" role="radiogroup"><button role="radio" aria-checked="${J.mode !== 'role'}" class="${J.mode !== 'role' ? 'on' : ''}" data-act="jfmode" data-v="post">Paste a job post</button><button role="radio" aria-checked="${J.mode === 'role'}" class="${J.mode === 'role' ? 'on' : ''}" data-act="jfmode" data-v="role">Type a role</button></div>
    ${J.mode === 'role'
      ? `<input id="jfRole" class="jf-role-in" maxlength="80" placeholder="e.g. Site reliability engineer, Data engineer, iOS developer" value="${esc(J.roleText || '')}" ${J.busy ? 'disabled' : ''}>
        <div class="chips">${['Site reliability engineer', 'Cloud engineer', 'Data engineer', 'Backend developer (Java)', 'DevOps engineer', 'QA automation engineer'].map(r => `<button class="chip" data-act="jfrolepick" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>`
      : `<textarea id="jfText" class="jf-text" rows="9" maxlength="6000" placeholder="Paste the job description or its requirements section…" ${J.busy ? 'disabled' : ''}>${esc(J.text)}</textarea>`}
    <div class="row"><button class="btn primary" data-act="jfgo" ${J.busy ? 'disabled' : ''}>${J.busy ? (J.mode === 'role' ? 'Picking the skills…' : 'Reading the job post…') : 'Build my decks'}</button><span class="muted small">Everything you build stays saved here.</span></div>
    ${J.busy ? `<div class="jf-decks" aria-hidden="true">${'<div class="jf-deck skel"></div>'.repeat(6)}</div>` : ''}
  </div>`;
  const total = r.stack.reduce((n, t) => n + (t.cards?.length || 0), 0);
  const decks = r.stack.map((t, i) => {
    const state = t.cards ? `<span class="jf-deck-n">${t.cards.length} cards</span>` : t.err ? `<span class="jf-deck-n err">Tap to retry</span>` : `<span class="jf-deck-n"><span class="jf-dot"></span> Writing…</span>`;
    return `<button class="jf-deck ${t.cards ? '' : 'wait'}" style="--k:${i}" data-act="${t.cards ? 'jfdeck' : t.err ? 'jfretry' : ''}" data-i="${i}" ${!t.cards && !t.err ? 'disabled' : ''}>
      <span class="jf-deck-i">${i + 1}</span><b>${esc(t.name)}</b>${t.why ? `<span class="jf-deck-why">${esc(t.why)}</span>` : ''}${state}</button>`;
  }).join('');
  return `<div class="stack jf">${head}${switcher}
    ${r.sample ? `<div class="jf-sample"><b>This is an example.</b><span>With Pro, paste your own job post and get decks for it.</span><button class="btn primary" data-act="plans">Unlock with Pro</button></div>` : ''}
    <div class="jf-hero"><div class="label">Your decks for</div><h1 class="jf-role">${esc(r.role || 'this job')}</h1>
      <p class="muted">${r.stack.length} skills${total ? ` · ${total} cards` : ''}</p>
      <button class="btn primary jf-all" data-act="jfswipe" ${total ? '' : 'disabled'}>${ic('cards')}Practice all${total ? ` ${total}` : ''} cards</button></div>
    <div class="jf-decks">${decks}</div>
    ${r.sample ? '' : briefSectionHtml(r)}
    ${r.sample ? '' : `<button class="link quiet small jf-del" data-act="jfdel">Remove this job post</button>`}
  </div>`;
}

/* ---------- Interview Lab: classic interview questions with worked answers, beyond flashcards ---------- */
// Content: web/content/lab/<format>.json (written by scripts/build-lab.mjs, fact-checked once, same for everyone).
const LAB_FREE = 3; // questions per format open on Free
const LAB_ICONS = { 'system-design': 'layers', coding: 'code', sql: 'list', lld: 'cards', behavioral: 'mic' };
function labTags(p = profile()) {
  const map = id => id.startsWith('backend') ? ['backend'] : id.startsWith('frontend') ? ['frontend'] : id === 'fullstack-js' ? ['frontend', 'backend']
    : id.startsWith('mobile') ? ['mobile'] : id.startsWith('data') ? ['data'] : id === 'ml-engineer' ? ['ml', 'data'] : id === 'qa-automation' ? ['backend']
    : id === 'security-engineer' ? ['backend', 'cloud'] : id === 'support' ? ['infra'] : [id];
  return new Set((p ? effectiveRoles(p) : []).flatMap(map));
}
async function labLoad(id) {
  const L = S.lab;
  if (id ? L.data[id] : L.index) return;
  try {
    const r = await fetch(`content/lab/${id || 'index'}.json`);
    if (!r.ok) throw new Error();
    if (id) L.data[id] = await r.json(); else L.index = await r.json();
  } catch { L.err = 'Could not load the questions. Check your connection.'; }
  if (S.lastView === 'lab') render();
}
function labView() {
  const L = S.lab || (S.lab = { fmt: null, q: null, data: {}, index: null, open: {} });
  if (!L.index) { labLoad(); return `<div class="stack lab"><h1>Interview Lab</h1><p class="muted">${esc(L.err || 'Loading…')}</p></div>`; }
  const pro = hasPro();
  // Question page
  if (L.fmt && L.q) {
    const f = L.data[L.fmt]; const q = f?.questions.find(x => x.id === L.q);
    if (!q) { L.q = null; return labView(); }
    const a = q.answer, st = L.open[q.id] || (L.open[q.id] = { show: false, mine: '', grade: '', busy: false });
    return `<div class="stack lab lab-q">
      <button class="back" data-act="labback">${ic('left')}${esc(f.name)}</button>
      <div><span class="mv-meta">${esc(f.name)} · ${esc(q.level === 'all' ? 'every level' : q.level)}</span><h1 class="lab-title">${esc(q.title)}</h1></div>
      ${st.show ? '' : `<section class="lab-try">
        <b>Try it first</b><span class="muted small">Say it out loud or type your answer. Then compare it with the worked answer.</span>
        <textarea id="labMine" rows="5" maxlength="4000" placeholder="Your answer, in a few lines…">${esc(st.mine)}</textarea>
        ${st.grade ? `<div class="lab-grade">${mdChat(st.grade)}</div>` : ''}
        <div class="row"><button class="btn" data-act="labgrade" ${st.busy ? 'disabled' : ''}>${st.busy ? 'Checking…' : 'Check my answer'}</button><button class="btn primary" data-act="labshow">Show the worked answer</button></div>
      </section>`}
      ${st.show ? `<section class="lab-ans">
        <p class="lab-sum">${fmt(a.summary)}</p>
        ${a.sections.map((s, i) => `<div class="lab-sec"><span class="lab-n">${i + 1}</span><div><h3>${esc(s.h)}</h3>${s.points.length ? `<ul>${s.points.map(p => `<li>${fmt(p)}</li>`).join('')}</ul>` : ''}${s.code ? `<pre><code>${esc(s.code)}</code></pre>` : ''}</div></div>`).join('')}
        ${a.mistakes.length ? `<div class="lab-box trap"><b>Mistakes to avoid</b><ul>${a.mistakes.map(m => `<li>${fmt(m)}</li>`).join('')}</ul></div>` : ''}
        ${a.followups.length ? `<div class="lab-box"><b>What they ask next</b><ul>${a.followups.map(m => `<li>${fmt(m)}</li>`).join('')}</ul></div>` : ''}
      </section>` : ''}
      <div class="row"><button class="btn ${st.show ? 'primary' : ''}" data-act="lablive">${ic('mic')}Practise it out loud with Live AI</button>${st.show ? `<button class="btn quiet" data-act="labhide">Hide the answer</button>` : ''}</div>
      ${labNext(f, q)}
    </div>`;
  }
  // Question list for one format
  if (L.fmt) {
    const f = L.data[L.fmt];
    if (!f) { labLoad(L.fmt); return `<div class="stack lab"><button class="back" data-act="labhome">${ic('left')}Interview Lab</button><p class="muted">${esc(L.err || 'Loading…')}</p></div>`; }
    const tags = labTags();
    const fits = q => q.tags.includes('all') || q.tags.some(t => tags.has(t));
    const list = [...f.questions.filter(fits), ...f.questions.filter(q => !fits(q))];
    return `<div class="stack lab">
      <button class="back" data-act="labhome">${ic('left')}Interview Lab</button>
      <div><h1>${esc(f.name)}</h1><p class="muted">${esc(f.blurb)}</p></div>
      <div class="lab-list">${list.map((q, i) => {
        const locked = !pro && f.questions.indexOf(q) >= LAB_FREE;
        return `<button class="lab-row ${locked ? 'is-locked' : ''}" data-act="${locked ? 'plans' : 'labq'}" data-id="${q.id}">
          <span class="lab-i">${i + 1}</span><span class="lab-t">${esc(q.title)}<span class="mv-meta">${esc(q.level === 'all' ? 'every level' : q.level)}${fits(q) && !q.tags.includes('all') ? ' · fits your role' : ''}</span></span>${locked ? ic('lock') : ic('right')}</button>`;
      }).join('')}</div>
      ${pro ? '' : `<p class="muted small">Free: the first ${LAB_FREE} in each list. <button class="link" data-act="plans">Pro opens all of them</button></p>`}
    </div>`;
  }
  // Home: the formats
  return `<div class="stack lab">
    <div><h1 class="lab-h">Interview Lab.</h1><p class="lede">The questions interviewers really ask, with the answer a strong candidate gives, laid out step by step. Try it yourself first, then compare.</p></div>
    <div class="lab-formats">${L.index.formats.map(f => `<button class="lab-fmt" data-act="labfmt" data-id="${f.id}">
      <span class="lab-fi">${ic(LAB_ICONS[f.id] || 'cards')}</span><b>${esc(f.name)}</b><span class="muted small">${esc(f.blurb)}</span><span class="mv-meta">${f.count} questions</span></button>`).join('')}</div>
  </div>`;
}
function labNext(f, q) {
  const i = f.questions.indexOf(q), n = f.questions[i + 1];
  if (!n || (!hasPro() && i + 1 >= LAB_FREE)) return '';
  return `<button class="lab-next" data-act="labq" data-id="${n.id}"><span class="mv-meta">Next question</span><b>${esc(n.title)}</b>${ic('right')}</button>`;
}
async function labGrade() {
  const L = S.lab, f = L.data[L.fmt], q = f.questions.find(x => x.id === L.q), st = L.open[q.id];
  st.mine = (document.getElementById('labMine')?.value || '').trim();
  if (st.mine.length < 20) return toast('Write a few lines first, the way you would say it in the interview.');
  st.busy = true; render();
  const ref = `${q.answer.summary}\n${q.answer.sections.map(s => `${s.h}: ${s.points.join(' ')}`).join('\n')}`.slice(0, 2500);
  try {
    st.grade = await ai.chat([{ role: 'user', content: `Grade my interview answer. Question (${f.name}): ${q.title}\n\nMy answer:\n${st.mine}\n\nCompare it with the reference answer. Reply with: one line verdict (strong / ok / needs work), then "Covered:" with the key points I got, then "Missing:" with the 2-3 most important points I left out. Be brief.` }],
      { profileSummary: summary(), context: `Reference answer for "${q.title}":\n${ref}` });
  } catch (e) { aiFailed(e); }
  st.busy = false; render();
}

/* Role brief: job post + résumé -> practice answers from the candidate's own work, then a mock interview. */
function briefSectionHtml(r) {
  const b = r.brief;
  if (!b) return `<section class="brief-start">
    <h3>Make it personal</h3>
    <p class="muted small">Add your résumé and get a practice brief for this role: likely questions answered with your own projects, your 60-second intro, and stories to tell.</p>
    <textarea id="jfResume" rows="5" maxlength="6000" placeholder="Paste your résumé, or a few lines about your recent work">${esc(lsGet('pp.resume', ''))}</textarea>
    <div class="row"><button class="btn primary" data-act="jfbrief" ${S.briefBusy ? 'disabled' : ''}>${S.briefBusy ? 'Building your brief…' : 'Build my brief'}</button><span class="muted small">Saved on this device only.</span></div>
  </section>`;
  return `<section class="brief">
    <h3>Your practice brief</h3>
    <div class="brief-block"><span class="brief-l">Tell me about yourself</span><p>${esc(b.about)}</p></div>
    <button class="jf-deck brief-deck" data-act="jfbriefswipe"><span class="jf-deck-i">${ic('cards')}</span><b>Your answers for this role</b><span class="jf-deck-why">Likely questions answered with your own projects${b.stories?.length ? ', plus stories to tell' : ''}.</span><span class="jf-deck-n">${b.qa.length + (b.stories?.length || 0)} cards</span></button>
    ${b.ask?.length ? `<div class="brief-block"><span class="brief-l">Questions to ask them</span><ul>${b.ask.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <button class="btn primary" data-act="jfmock">${ic('mic')}Mock interview for this role</button>
    <button class="link quiet small" data-act="jfbriefnew">Rebuild with a different résumé</button>
  </section>`;
}
async function buildBrief() {
  const J = S.jf, resume = (document.getElementById('jfResume')?.value || '').trim();
  if (resume.length < 80) return toast('Paste a bit more of your résumé: your recent roles and projects.');
  lsSet('pp.resume', resume);
  S.briefBusy = true; render();
  try {
    const d = await ai.post('/api/jobfocus/brief', { jd: J.result.text || J.text, resume });
    J.result.brief = { role: d.role, about: d.about, qa: d.qa, stories: d.stories, ask: d.ask };
    jfSave(J.result);
  } catch (e) { if (e.code === 'pro') S.showPlans = true; else aiFailed(e); }
  finally { S.briefBusy = false; render(); }
}
function startBriefDeck() {
  const b = S.jf?.result?.brief;
  if (!b) return;
  const cards = [...b.qa.map((x, i) => ({ id: `br-${i}`, topic: 'Your brief', topicName: 'Your brief', q: x.q, a: x.a, l: 0, jf: true })),
    ...(b.stories || []).map((x, i) => ({ id: `brs-${i}`, topic: 'Your stories', topicName: 'Your stories', q: `Tell me about ${x.prompt}`, a: x.story, l: 0, jf: true }))];
  S.deck = { cards, results: [], free: false, total: cards.length, mode: 'swipe', jf: true };
  S.di = 0; S.reveal = false; S.view = 'deck'; render();
}

async function jobFocusGo() {
  const J = S.jf;
  const byRole = J.mode === 'role';
  if (byRole) {
    J.roleText = (document.getElementById('jfRole')?.value || '').replace(/\s+/g, ' ').trim();
    if (J.roleText.length < 2) return toast('Type a role, for example "Site reliability engineer".');
    J.text = `Role: ${J.roleText}`;
  } else {
    J.text = (document.getElementById('jfText')?.value || '').trim();
    if (J.text.length < 80) return toast('Paste a bit more of the job description: the requirements section works best.');
  }
  J.busy = true; render();
  try {
    // Step 1 (~1-2 s): the skills. The screen fills right away.
    const d = await ai.post('/api/jobfocus', byRole ? { role: J.roleText } : { text: J.text });
    J.result = { id: Date.now().toString(36), role: d.role, text: J.text, stack: d.stack.map(t => ({ ...t, cards: null })) }; J.ticket = d.ticket; J.sel = 0; J.open = new Set();
  } catch (e) {
    if (e.code === 'pro') S.showPlans = true;
    else oops(e.message || 'Could not read that job post. Try again.');
    return;
  } finally { J.busy = false; render(); }
  // Step 2: every skill's cards in parallel; each set appears as soon as it is written.
  await Promise.all(J.result.stack.map((_, i) => jobFocusCards(i)));
}

async function jobFocusCards(i) {
  const J = S.jf, r = J.result, t = r?.stack[i];
  if (!t) return;
  t.err = null; t.cards = null; if (S.lastView === 'focus') render();
  try {
    const d = await ai.post('/api/jobfocus/cards', { ticket: J.ticket, i });
    if (J.result !== r) return; // a new job post was started meanwhile
    t.cards = d.cards;
  } catch (e) { if (J.result !== r) return; t.err = e.message || 'Could not write these cards.'; }
  if (r.stack.every(x => x.cards)) jfSave(r);
  if (S.lastView === 'focus') render();
}

function lockedTopicView(t) {
  const p = profile();
  const all = rankTopics(topics(), p).filter(x => !x.custom && !x.private);
  const open = [...freeTopicIds()].map(topicById).filter(Boolean);
  const first = t.concepts[0];
  const story = storyView(t.id, Math.max(0, t.concepts.length - 1), t.concepts.length);
  return `<div class="stack">
    <div class="row between"><button class="back" data-act="home">${ic('left')}Plan</button><span class="tag">${ic('lock')} Pro</span></div>
    <div class="head"><h1>${esc(t.name)}</h1><p class="lede" style="margin-top:8px">${esc(t.blurb || '')}</p></div>
    <p class="muted">${t.concepts.length} lessons, ${t.qa.length} interview questions${story ? ', and a diagram that builds as you read' : ''}.</p>
    ${story ? diagramTeaser(t.id, story.html) : ''}
    ${first ? `<article class="peek" aria-label="Preview of the first lesson"><h2>${esc(first.t)}</h2><p class="lede" style="max-width:none">${fmt(first.what)}</p></article>` : ''}
    <section><div class="sec-head"><h3>Inside this topic</h3></div>
      <div class="rows">${t.concepts.map((c, i) => `<div class="rowi static ${i > 1 ? 'dim' : ''}"><span class="main"><span class="t">${esc(c.t)}</span></span>${i > 1 ? ic('lock') : ''}</div>`).join('')}</div></section>
    <section class="card live-hero stack">
      <h2>Unlock all ${all.length} of your topics</h2>
      <p>Free opens ${open.length ? open.map(x => esc(x.name)).join(', ') : `your first ${FREE_TOPICS} topics`}. Pro opens every lesson, every flashcard and every animated diagram for your role, plus AI to practise with.</p>
      <div class="row"><button class="btn invert lg" data-act="plans">See pricing</button>${t.qa.length ? `<button class="btn quiet invert-quiet" data-act="deck" data-id="">Try your free cards</button>` : ''}</div>
    </section>
  </div>`;
}

function learnView() {
  const t = topicById(S.topic);
  if (!t) return '<p class="muted">Loading…</p>';
  if (isLocked(t.id)) return lockedTopicView(t);
  const c = t.concepts[S.ci];
  if (!c) return `<div class="stack"><h2>${esc(t.name)}</h2><p class="muted">This topic has questions only.</p><div class="row"><button class="btn primary" data-act="deck" data-id="${t.id}">Practice flashcards</button></div></div>`;
  const last = S.ci >= t.concepts.length - 1;
  // The lesson is a story and the diagram is its visual thread: it builds
  // piece by piece as the cards go on, so finishing the lesson means
  // finishing the picture. Every card shows the scene it is in; cards with
  // a diagram show the building picture with the current scene highlighted.
  const story = storyView(t.id, S.ci, t.concepts.length);
  const scene = `<div class="scene"><span class="label">Scene ${S.ci + 1} of ${t.concepts.length} · ${esc(sceneName(S.ci, t.concepts.length))}</span>${story ? `<span class="muted small">Step ${story.focus + 1} of ${story.steps} · the picture builds as you read</span>` : ''}</div>`;
  return `<div class="stack">
    <div class="row between"><button class="back" data-act="home">${ic('left')}Plan</button><span class="muted small">${esc(t.name)}, ${S.ci + 1} of ${t.concepts.length}</span></div>
    <div class="segs">${t.concepts.map((_, i) => `<i class="${i <= S.ci ? 'on' : ''}"></i>`).join('')}</div>
    ${story ? `${scene}${diagramTeaser(t.id, story.html)}` : scene}
    <article class="lesson" style="padding:14px 0 6px">
      ${c.basic ? `<span class="tag" style="margin-bottom:8px">Basics${profile()?.level === 'senior' ? ', you may know this' : ''}</span>` : ''}
      <h1>${esc(c.t)}</h1>
      <div class="part body" style="margin-top:16px"><p class="lede" style="max-width:none">${fmt(c.what)}</p></div>
      ${c.why ? `<div class="part"><div class="label">Why interviewers ask</div><p style="font:400 1.05rem/1.6 var(--serif);color:var(--ink-soft)">${fmt(c.why)}</p></div>` : ''}
      ${c.ex ? `<div class="part"><div class="label">Example</div><pre><code>${esc(c.ex)}</code></pre></div>` : ''}
      ${c.tip ? `<div class="part say"><div class="label">Say it like this</div><p style="font:400 1.05rem/1.6 var(--serif)">${fmt(c.tip)}</p></div>` : ''}
      ${t.beta ? `<div class="part">${betaNote(t, `card ${S.ci + 1}: ${c.t}`)}</div>` : ''}
    </article>
    <div class="row">
      <button class="btn" data-act="cprev" ${S.ci === 0 ? 'disabled' : ''} aria-label="Previous lesson">${ic('left')}</button>
      <button class="btn" data-act="askcard">Ask AI</button>
      ${last ? `<button class="btn primary grow" data-act="deck" data-id="${t.id}">Test yourself</button>` : '<button class="btn primary grow" data-act="cnext">Next lesson</button>'}
    </div>
    ${!last && c.hook ? `<button class="hook" data-act="cnext"><span class="label">Next</span><span>${esc(c.hook)}</span>${ic('right')}</button>` : ''}
    ${last && t.field ? `<div class="row">${['trouble', 'scenarios'].filter(k => t.field[k]?.length).map(k => `<button class="btn" data-act="fielddeck" data-k="${k}" data-id="${t.id}">${hasPro() ? '' : ic('lock')}${FIELD_KINDS[k]}: ${t.field[k].length} cards</button>`).join('')}</div>` : ''}
    ${last ? `<p class="muted small" style="margin-top:2px">That's the whole story, and the picture is finished. Test yourself while it's fresh.</p>${t.upNext ? `<div class="hook static"><span class="label">After this</span><span>${esc(t.upNext)}</span></div>` : ''}` : ''}
  </div>`;
}

function deckView() {
  const d = S.deck;
  if (!d.cards.length) return `<div class="stack" style="padding-top:30px"><h1>You have seen every card here for now.</h1><p class="lede">They come back when they are worth another look. Start a new topic${hasPro() ? '' : ', or unlock every topic and its cards with Pro'}.</p><div class="row">${hasPro() ? '' : '<button class="btn primary" data-act="plans">Unlock more topics</button>'}<button class="btn" data-act="home">Back to plan</button></div></div>`;
  if (S.di >= d.cards.length) {
    S.swStreak = 0; S.swMatch = false;
    const got = d.results.filter(Boolean).length;
    const pct = Math.round((got * 100) / d.cards.length);
    // The topic with the most missed cards gets its diagram right here, so the
    // fix is one look away instead of a hunt through the lessons.
    const missed = {};
    d.cards.forEach((c, i) => { if (!d.results[i]) missed[c.topic] = (missed[c.topic] || 0) + 1; });
    const worst = Object.entries(missed).sort((a, b) => b[1] - a[1])[0]?.[0];
    return `<div class="stack" style="padding-top:30px">
      <div class="score-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="52"/><circle class="ring-prog" cx="60" cy="60" r="52" pathLength="100" style="stroke-dashoffset:${ringOffset(pct)}"/></svg><div class="score-num"><span class="n" data-countup="${got}">${got}</span><span class="muted small">of ${d.cards.length} · ${pct}%</span></div></div>
      ${d.mode?.startsWith('swipe') ? `<h2>${got} match${got === 1 ? '' : 'es'}${d.cards.length - got ? `, ${d.cards.length - got} to work on` : '. Clean sweep.'}</h2>${d.matches?.length ? `<p class="note">New topic match${d.matches.length > 1 ? 'es' : ''}: <b>${d.matches.map(id => esc(topicName(id))).join(', ')}</b>. Every card known.</p>` : ''}` : `<h2>${pct >= 80 ? 'A strong round.' : pct >= 50 ? 'Getting there.' : 'Better to find out now.'}</h2>`}
      <p class="lede">${pct >= 80 ? 'These cards come back later, spaced further apart each time.' : 'The cards you missed come back first next time. Rereading the lessons for those topics will help.'}</p>
      ${worst && diagramFor(worst) ? `<section class="stack tight"><h3>The one to reread: ${esc(topicName(worst))}</h3>${diagramTeaser(worst, diagramHtml(worst))}<div class="row"><button class="btn" data-act="learn" data-id="${worst}">Reread the ${esc(topicName(worst))} lesson</button></div></section>` : ''}
      ${d.free ? `<section class="card live-hero stack"><h2>That was your free round.</h2><p>Free gives you ${FREE_CARDS} cards for each technology you picked, shuffled. Pro opens all ${d.total}, in the order you work, plus troubleshooting and real scenarios from the field.</p><div class="row"><button class="btn invert" data-act="plans">Unlock every card</button></div></section>` : ''}
      ${d.jf ? `<div class="row"><button class="btn primary" data-act="jfswipe">Swipe them again</button><button class="btn" data-act="jobfocus">Back to Role Ready</button></div></div>` : `<div class="row"><button class="btn ${d.free ? '' : 'primary'}" data-act="deck" data-id="${esc((d.ids || []).join(','))}">${d.mode.startsWith('swipe') ? 'Swipe another mix' : 'Practice another round'}</button><button class="btn" data-act="home">Back to plan</button></div></div>`}`;
  }
  if (d.mode === 'swipe' && S.di < d.cards.length) return swipeView();
  const q = d.cards[S.di];
  const t = topicById(q.topic);
  const swipe = false;
  const singleTopic = !swipe && d.cards.length && d.cards.every(c => c.topic === d.cards[0].topic) ? d.cards[0].topic : null;
  const intro = swipe && lsGet('pp.swipeIntro', '') !== '1';
  return `<div class="stack ${swipe ? 'swipe-mode' : ''}">
    ${S.lsLabel ? `<p class="ls-now">${ic('search')}${esc(S.lsLabel)}</p>` : ''}
    <div class="deck-top"><button class="back" data-act="${d.jf ? 'jobfocus' : 'home'}">${ic('left')}${d.jf ? 'Role Ready' : 'Stop'}</button><span class="deck-count">${S.di + 1}<i>/</i>${d.cards.length}</span>${popBtn()}${d.jf ? '<span></span>' : modeToggle(false)}</div>
    <div class="bar"><i style="width:${(S.di * 100) / d.cards.length}%"></i></div>
    ${d.free && S.di === 0 ? `<p class="note small row between"><span>Shuffled on Free. Pro takes you through every card in your workflow’s order.</span><button class="link" data-act="plans">See Pro</button></p>` : ''}
    ${singleTopic && diagramFor(singleTopic) ? `<div class="row between"><span></span><button class="link quiet small" data-act="dgsheet" data-id="${singleTopic}">How it works — see the diagram</button></div>` : ''}
    <article class="card stacked flash" id="flash">
      <div class="card-head"><span>${esc(t?.name || q.topicName || q.topic)}</span><span class="level">${q.kind ? FIELD_KINDS[q.kind] : ['', 'Fundamentals', 'Applied', 'Advanced'][q.l] || (q.jf ? 'Role Ready' : '')}</span></div>
      ${intro ? `<div class="sw-intro" aria-live="polite"><div class="sw-hand" aria-hidden="true"><i></i></div><b>Swipe mode</b><span>Tap to flip. Then swipe <b>right</b> if you knew it, <b>left</b> if you didn’t. Cards come from all your skills, mixed.</span><button class="btn primary" data-act="swipeintro">Let’s go</button></div>` : ''}
      <p class="q">${fmt(q.q)}</p>
      ${S.reveal ? `<div class="ans">${fmt(q.a)}</div>${learnHtml(q)}` : ''}
      <div class="foot">${S.reveal ? (swipe ? `
        <div class="sw-btns"><button class="sw-btn miss" data-act="grade" data-ok="0" aria-label="Missed it">${ic('x')}</button><button class="sw-btn got" data-act="grade" data-ok="1" aria-label="Got it">${ic('check')}</button></div>` : `
        <div class="row"><button class="btn miss lg" data-act="grade" data-ok="0">Missed it</button><button class="btn got lg" data-act="grade" data-ok="1">Got it</button></div>`) : ''}${S.reveal ? `
        <div class="row between small"><button class="link quiet" data-act="askq">Go deeper with AI</button>${betaNote(t, `question: ${q.q}`)}</div>`
      : '<button class="btn primary lg block" data-act="reveal">Show the answer</button><p class="muted small" style="text-align:center">Say your answer out loud first.</p>'}
      <p class="muted small kbd-hint" style="text-align:center">Space to reveal · ← missed · → got it</p>
</div>
    </article>
  </div>`;
}

/* Card mode switch: two icons in a pill, a thumb slides to the chosen one. */
const modeToggle = swipe => `<div class="mode-tg ${swipe ? 'is-swipe' : ''}" role="radiogroup" aria-label="Card mode">
  <button role="radio" aria-checked="${!swipe}" data-act="deckmode" data-m="steady" title="Steady: in order">${ic('list')}<span>Steady</span></button>
  <button role="radio" aria-checked="${swipe}" data-act="deckmode" data-m="swipe" title="Swipe: mixed skills">${ic('cards')}<span>Swipe</span></button></div>`;

/* ---------- Swipe mode: its own screen, a real card stack ---------- */
const cardFace = (q, back) => {
  const t = topicById(q.topic);
  const name = esc(t?.name || q.topicName || q.topic);
  const lvl = ['', 'Fundamentals', 'Applied', 'Advanced'][q.l] || (q.jf ? 'Role Ready' : '');
  return back
    ? `<div class="sw-face back"><div class="sw-head"><span>${name}</span><span>Answer</span></div><p class="sw-q-small">${fmt(q.q)}</p><div class="sw-a${q.a.length > 200 ? ' long' : ''}">${fmt(q.a)}</div>${q.why ? `<div class="sw-more">${learnBody(q)}</div><button class="sw-more-btn" data-act="swmore">${ic('bulb')}<span>Why · Example · Trap</span></button>` : ''}<p class="sw-tip">Right: knew it · Left: not quite · Up: know it cold</p></div>`
    : `<div class="sw-face front"><div class="sw-head"><span>${name}</span><span>${lvl}</span></div><p class="sw-q">${fmt(q.q)}</p><p class="sw-tip">${ic('refresh')}Tap to flip</p></div>`;
};
const swCardHtml = (q, top) => `<article class="sw-card ${top ? 'is-top' : 'is-next'}" ${top ? 'id="swTop"' : 'aria-hidden="true"'}>
  <div class="sw-inner">${cardFace(q, false)}${top ? cardFace(q, true) : ''}</div>
  ${top ? `<span class="sw-stamp got" aria-hidden="true">${ic('check')}Got it</span><span class="sw-stamp miss" aria-hidden="true">${ic('x')}Nope</span><span class="sw-stamp star" aria-hidden="true">${ic('star')}Know it cold</span>` : ''}</article>`;
function swStageHtml() {
  const d = S.deck, q = d.cards[S.di], n = d.cards[S.di + 1], n2 = d.cards[S.di + 2];
  return `${n2 ? '<div class="sw-card is-ghost" aria-hidden="true"></div>' : ''}${n ? swCardHtml(n, false) : ''}${swCardHtml(q, true)}`;
}
function swipeView() {
  const d = S.deck;
  const intro = lsGet('pp.swipeIntro', '') !== '1';
  const streak = S.swStreak || 0;
  return `<div class="stack swipe-screen">
    ${S.lsLabel ? `<p class="ls-now">${ic('search')}${esc(S.lsLabel)}</p>` : ''}
    <div class="deck-top"><button class="back" data-act="${d.jf ? 'jobfocus' : 'home'}">${ic('left')}${d.jf ? 'Role Ready' : 'Stop'}</button><span class="deck-count" id="swCount">${S.di + 1}<i>/</i>${d.cards.length}</span>${popBtn()}${d.jf ? '<span></span>' : modeToggle(true)}</div>
    <div class="sw-dots" aria-hidden="true">${d.cards.map((_, i) => `<i class="${i < S.di ? (d.results[i] ? 'ok' : 'no') : i === S.di ? 'now' : ''}"></i>`).join('')}</div>
    <div class="sw-stage" id="swStage">${swStageHtml()}${intro ? `<div class="sw-intro"><div class="sw-hand" aria-hidden="true"><i></i></div><b>Swipe right on what you know</b><span>Tap to flip. <b>Right</b> if you know it, <b>left</b> if you don’t, <b>up</b> if you know it cold. No ghosting.</span><button class="btn primary" data-act="swipeintro">Let’s play</button></div>` : ''}
      <div class="sw-streak ${streak >= 3 ? 'show' : ''}" id="swStreak">${streak} in a row</div><div class="sw-burst" id="swBurst" aria-hidden="true"></div></div>
    <div class="sw-btns"><button class="sw-btn miss" data-act="swgo" data-ok="0" aria-label="Didn't know it">${ic('x')}</button><button class="sw-btn flip" data-act="swflip" aria-label="Flip the card">${ic('refresh')}</button><button class="sw-btn star" data-act="swgo" data-ok="2" aria-label="Know it cold">${ic('star')}</button><button class="sw-btn got" data-act="swgo" data-ok="1" aria-label="Knew it">${ic('check')}</button></div>
    ${d.jf ? '' : '<div class="row between small"><button class="link quiet" data-act="askq">Go deeper with AI</button><span class="muted">← → ↑ keys work too</span></div>'}
  </div>`;
}

/* Chat list by swipe, like the ChatGPT / Claude apps: drag right anywhere on the chat to pull the
   drawer out, drag left to put it back. Vertical scrolling and code blocks are left alone. */
let dz = null;
document.addEventListener('touchstart', e => {
  if (!document.body.classList.contains('has-drawer') || S.rt || window.innerWidth >= 900 || e.touches.length !== 1) return;
  const t = e.touches[0], el = e.target;
  if (el.closest('pre, textarea, input, .swipe-screen, .lf-tabs, #sheet, .dg')) return;
  const drawer = document.querySelector('.nd');
  if (!drawer) return;
  dz = { x: t.clientX, y: t.clientY, open: !!S.drawer, drawer, w: drawer.offsetWidth, on: false };
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!dz) return;
  const t = e.touches[0], dx = t.clientX - dz.x, dy = t.clientY - dz.y;
  if (!dz.on) {
    if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { dz = null; return; } // a scroll
    if (Math.abs(dx) < 12 || (dz.open ? dx > 0 : dx < 0)) return;
    dz.on = true; dz.drawer.style.transition = 'none';
    document.body.classList.add('drawer-drag');
  }
  const x = dz.open ? Math.min(0, dx) : Math.min(0, -dz.w + dx);
  dz.drawer.style.transform = `translateX(${x}px)`; dz.drawer.style.opacity = 1; dz.x2 = dx;
  const shell = document.getElementById('shell');
  if (shell) { shell.style.transition = 'none'; shell.style.transform = `translateX(${dz.w + x}px)`; shell.style.borderRadius = '28px'; shell.style.setProperty('--scrim-o', String(Math.max(0, Math.min(1, (dz.w + x) / dz.w)))); }
}, { passive: true });
// Release, or the browser taking the gesture back (touchcancel): glide to
// open/closed from the finger's position instead of snapping. Transitions
// are restored first; the dragged transforms are cleared on the next frame
// so the CSS transition animates from where the finger left off.
function endDrawerDrag() {
  if (!dz) return;
  const d = dz; dz = null;
  if (!d.on) return;
  document.body.classList.remove('drawer-drag');
  const shell = document.getElementById('shell');
  d.drawer.style.transition = '';
  if (shell) shell.style.transition = '';
  const open = d.open ? d.x2 > -d.w * 0.3 : d.x2 > Math.min(90, d.w * 0.3);
  requestAnimationFrame(() => {
    if (dz) return; // a new drag started in the meantime; leave it alone
    d.drawer.style.transform = ''; d.drawer.style.opacity = '';
    if (shell) { shell.style.transform = ''; shell.style.borderRadius = ''; shell.style.removeProperty('--scrim-o'); }
    setDrawer(open);
  });
}
document.addEventListener('touchend', endDrawerDrag);
document.addEventListener('touchcancel', endDrawerDrag);
// Safety net: if anything ever leaves the panel half-open (app sent to background mid-swipe), reset it.
document.addEventListener('visibilitychange', () => { const d = document.querySelector('.nd'), sh = document.getElementById('shell'); dz = null; document.body.classList.remove('drawer-drag'); if (d) { d.style.transform = ''; d.style.transition = ''; d.style.opacity = ''; } if (sh) { sh.style.transform = ''; sh.style.transition = ''; sh.style.borderRadius = ''; } });

/* Keyboard open on a phone: pin the chat input right on top of the keyboard (iOS shrinks only the
   visual viewport, so a bottom-docked box would otherwise float with a gap or hide under the keys). */
function placeDock() {
  const vv = window.visualViewport, dock = document.querySelector('.ai-dock');
  const kb = !!(vv && dock && document.activeElement?.id === 'chatInput' && (screen.height - vv.height > 200 || window.innerHeight - vv.height > 120));
  document.documentElement.classList.toggle('kb-open', kb);
  if (!dock) return;
  if (kb) dock.style.top = `${vv.offsetTop + vv.height - dock.offsetHeight}px`;
  else dock.style.top = '';
}
if (window.visualViewport) {
  visualViewport.addEventListener('resize', placeDock);
  visualViewport.addEventListener('scroll', placeDock);
}
document.addEventListener('focusin', e => { if (e.target.id === 'chatInput') { setTimeout(placeDock, 50); setTimeout(() => { placeDock(); scrollEnd(); }, 320); } });
document.addEventListener('focusin', e => { if (e.target.id === 'learnSearch') setTimeout(() => e.target.scrollIntoView({ block: 'start', behavior: 'smooth' }), 300); });
document.addEventListener('focusout', e => { if (e.target.id === 'chatInput') setTimeout(placeDock, 50); });

const SW_AT = 100; // px past which a release counts
let sw = null, swRaf = 0;
function swFlip() {
  const c = document.getElementById('swTop');
  if (!c) return;
  c.classList.toggle('flipped'); S.reveal = c.classList.contains('flipped');
}
function swApply() {
  swRaf = 0;
  if (!sw) return;
  const { card, dx, dy, sign } = sw;
  const up = dy < 0 && -dy > Math.abs(dx);
  const k = up ? 0 : Math.max(-1, Math.min(1, dx / SW_AT));
  card.style.transform = `translate3d(${dx}px, ${up ? dy : dy * 0.35}px, 0) rotate(${(dx / 14) * sign}deg)`;
  card.style.setProperty('--got', Math.max(0, k)); card.style.setProperty('--miss', Math.max(0, -k));
  card.style.setProperty('--star', up ? Math.min(1, -dy / SW_AT) : 0);
  const next = document.querySelector('.sw-card.is-next');
  if (next) next.style.setProperty('--lift', Math.min(1, Math.abs(dx) / SW_AT));
}
// Decide a card: fly it off along its own direction, then let the next card take its place.
function swDecide(ok, vx = 0, easy = false) {
  const card = document.getElementById('swTop');
  const d = S.deck;
  if (!card || S.grading || S.swMatch || !d || S.di >= d.cards.length) return;
  S.grading = true; sw = null;
  const q = d.cards[S.di];
  let matched = null;
  if (!q.jf) {
    const prog = store.progress(), t = topicById(q.topic), p = profile();
    const before = t ? readiness([t], p, prog).pct : 0;
    prog[q.id] = review(prog[q.id], ok, Date.now(), easy); store.setProgress(prog);
    // Every card in a topic known: that's a match.
    if (ok && t && before < 100 && readiness([t], p, prog).pct >= 100) matched = t;
  }
  store.setActivity(recordActivity(store.activity(), todayKey(), ok));
  if (navigator.vibrate) try { navigator.vibrate(ok ? 12 : [8, 40, 8]); } catch { /* not allowed */ }
  const dist = Math.max(window.innerWidth, 600) * 1.2;
  const speed = Math.max(0.9, Math.min(2.5, Math.abs(vx)));
  const ms = Math.round(360 / speed);
  card.classList.remove('dragging');
  card.style.transition = `transform ${ms}ms cubic-bezier(.2, .6, .35, 1), opacity ${ms}ms ease-in`;
  card.style.setProperty(easy ? '--star' : ok ? '--got' : '--miss', 1);
  card.style.transform = easy ? `translate3d(0, ${-Math.max(window.innerHeight, 700) * 1.2}px, 0) rotate(-6deg)`
    : `translate3d(${ok ? dist : -dist}px, 60px, 0) rotate(${ok ? 32 : -32}deg)`;
  card.style.opacity = '0';
  const next = document.querySelector('.sw-card.is-next');
  if (next) next.classList.add('rise');
  // Streak: a fun nudge for runs of known cards.
  S.swStreak = ok ? (S.swStreak || 0) + 1 : 0;
  const st = document.getElementById('swStreak');
  if (st) { st.textContent = `${S.swStreak} in a row`; st.classList.toggle('show', S.swStreak >= 3); if (S.swStreak >= 3) { st.classList.remove('pop'); void st.offsetWidth; st.classList.add('pop'); } }
  if (ok && S.swStreak && S.swStreak % 5 === 0) swBurst();
  d.results.push(ok); S.di++; S.reveal = false;
  const dot = document.querySelectorAll('.sw-dots i');
  if (dot[S.di - 1]) dot[S.di - 1].className = ok ? 'ok' : 'no';
  if (dot[S.di]) dot[S.di].className = 'now';
  const cnt = document.getElementById('swCount');
  if (cnt && S.di < d.cards.length) cnt.textContent = `${S.di + 1} / ${d.cards.length}`;
  setTimeout(() => {
    S.grading = false;
    if (S.di >= d.cards.length) {
      if (native() && !store.notifAsked()) { store.setNotifAsked(true); promptNotifications(); }
      d.mode = 'swipe-done';
      if (matched) { S.swEndAfterMatch = true; return swMatch(matched); } // celebrate first, summary after
      return render(); // the round summary uses the regular end screen
    }
    // Only the stage is redrawn: the risen card is replaced by an identical one, so nothing jumps.
    const stage = document.getElementById('swStage');
    if (stage) { stage.querySelectorAll('.sw-card').forEach(e => e.remove()); stage.insertAdjacentHTML('afterbegin', swStageHtml()); }
    if (matched) swMatch(matched);
  }, Math.min(ms, 260));
}
// "It's a match": a topic fully known. Pauses the round until dismissed.
function swMatch(t) {
  const stage = document.getElementById('swStage');
  if (!stage) return;
  S.swMatch = true;
  (S.deck.matches = S.deck.matches || []).push(t.id);
  const initials = t.name.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  stage.insertAdjacentHTML('beforeend', `<div class="sw-match" role="dialog" aria-label="It's a match">
    <p class="sw-match-t">It’s a match!</p>
    <div class="sw-match-pair"><span class="sw-av you">You</span><span class="sw-heart">${ic('check')}</span><span class="sw-av topic">${esc(initials)}</span></div>
    <p class="sw-match-s">You and <b>${esc(t.name)}</b>: every card known.</p>
    <button class="btn primary" data-act="swmatchok">${S.swEndAfterMatch ? 'See my round' : 'Keep swiping'}</button></div>`);
  swBurst();
}
function swBurst() {
  const b = document.getElementById('swBurst');
  if (!b || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  b.innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="--a:${(i / 14) * 360}deg;--d:${60 + (i % 3) * 22}px"></i>`).join('');
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
}
app.addEventListener('pointerdown', e => {
  const card = e.target.closest('#swTop');
  if (!card || S.grading || e.button > 0 || e.target.closest('button, a')) return;
  const sc = e.target.closest('.sw-a, .sw-more'); // long text scrolls inside the card instead of dragging it
  if (sc && sc.scrollHeight > sc.clientHeight + 2) return;
  const r = card.getBoundingClientRect();
  // Grabbed low on the card, it tilts the other way, like a real card.
  sw = { card, x: e.clientX, y: e.clientY, dx: 0, dy: 0, id: e.pointerId, drag: false, sign: e.clientY > r.top + r.height * 0.6 ? -1 : 1, hist: [[performance.now(), e.clientX]] };
});
app.addEventListener('pointermove', e => {
  if (!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.drag) {
    if (Math.hypot(dx, dy) < 6) return;
    sw.drag = true; sw.card.setPointerCapture?.(e.pointerId); sw.card.classList.add('dragging');
  }
  e.preventDefault();
  sw.dx = dx; sw.dy = dy;
  sw.hist.push([performance.now(), e.clientX]); if (sw.hist.length > 5) sw.hist.shift();
  if (!swRaf) swRaf = requestAnimationFrame(swApply);
});
function swEnd(e) {
  if (!sw || (e && e.pointerId !== sw.id)) return;
  const s0 = sw;
  if (!s0.drag) { sw = null; if (e?.type === 'pointerup') swFlip(); return; }
  const [t0, x0] = s0.hist[0], [t1, x1] = s0.hist[s0.hist.length - 1];
  const vx = (x1 - x0) / Math.max(1, t1 - t0); // px per ms
  if (-s0.dy > SW_AT && -s0.dy > Math.abs(s0.dx)) return swDecide(true, 1.6, true); // up: know it cold
  if (Math.abs(s0.dx) > SW_AT || (Math.abs(vx) > 0.55 && Math.abs(s0.dx) > 30)) return swDecide(s0.dx > 0, vx);
  sw = null;
  const card = s0.card;
  card.classList.remove('dragging');
  card.style.transition = 'transform .45s cubic-bezier(.18, 1.35, .4, 1)';
  card.style.transform = ''; card.style.setProperty('--got', 0); card.style.setProperty('--miss', 0); card.style.setProperty('--star', 0);
  document.querySelector('.sw-card.is-next')?.style.setProperty('--lift', 0);
  setTimeout(() => { card.style.transition = ''; }, 460);
}
app.addEventListener('pointerup', swEnd);
app.addEventListener('pointercancel', swEnd);

const STATUS = { connecting: 'Connecting…', ready: 'Listening. Just talk.', listening: 'Listening. I won\'t interrupt.', you: 'You\'re speaking…', thinking: 'Thinking…', ai: 'Speaking. Talk to interrupt.' };
const MODE_NAME = { talk: 'Talk', listen: 'Rehearse', live: 'Live AI' };
const clock = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

function voicePanel() {
  // Call bar: sits at the bottom next to the thumb, like a phone call.
  const cb = (act, icon, label, extra = '') => `<button class="cb-btn ${extra}" data-act="${act}" aria-label="${label}"><span class="cb-ic">${ic(icon)}</span><span class="cb-l">${label}</span></button>`;
  if (S.rt) {
    return `<section class="callbar" aria-label="Voice controls">
      <div class="cb-top"><div class="pulse status-${S.rtStatus} ${S.muted ? 'muted' : ''}" id="rtOrb"></div>
        <span class="status" id="rtStatus">${esc(S.muted ? 'Muted' : STATUS[S.rtStatus] || S.rtStatus)}</span>
        <span class="timer" id="rtTimer">${esc(MODE_NAME[S.rtMode] || '')}</span></div>
      <div class="cb-row">
        ${cb('rtmute', S.muted ? 'micoff' : 'mic', S.muted ? 'Unmute' : 'Mute', S.muted ? 'on' : '')}
        ${S.rtSpeaks ? cb('rtsound', S.soundOff ? 'soundoff' : 'sound', S.soundOff ? 'Sound off' : 'Sound', S.soundOff ? 'on' : '') : ''}
        ${S.rtMode === 'listen' ? cb('rtrespond', 'check', 'Feedback') : ''}
        ${S.rtMode === 'live' ? cb('livepause', 'pause', 'Pause') : ''}
        ${cb('rtstop', 'x', 'End', 'end')}
      </div>
    </section>`;
  }
  if (S.livePaused) {
    const oneTime = S.livePaused.oneTime;
    return `<section class="callbar paused" aria-label="Voice controls">
      <div class="cb-top"><div class="pulse paused" aria-hidden="true"></div><span class="status">Paused</span><span class="timer">${oneTime ? 'Your one-time hour keeps running' : 'Minutes not counting'}</span></div>
      <div class="cb-row">${cb('liveresume', 'play', 'Resume', 'go')}${cb('livediscard', 'x', 'End', 'end')}</div>
    </section>`;
  }
  if (!(S.voiceServer && realtimeSupported)) {
    return S.healthLoaded ? `<p class="note">Live voice isn't available ${S.voiceServer ? 'in this browser' : 'right now'}. You can still type, or dictate with the microphone button.</p>` : '';
  }
  const dis = S.rtStarting ? 'disabled' : '';
  const { credits, left } = liveState();
  const o = offer();
  return `${livePromo()}<div class="rows">
${store.account()?.plan === 'pro' ? '' : `    <button class="mode" data-act="rtstart" data-mode="talk" ${dis}><span class="ico">${ic('mic')}</span><span class="main"><b>Talk it through</b><span class="d">A spoken conversation. Interrupt whenever you like.</span></span>${ic('right')}</button>
    <button class="mode" data-act="rtstart" data-mode="listen" ${dis}><span class="ico">${ic('ear')}</span><span class="main"><b>Rehearse an answer</b><span class="d">Speak without being interrupted, then get it graded.</span></span>${ic('right')}</button>`}
  </div>`;
}

/* ---------- account / paywall ---------- */
const mins = sec => (sec / 60).toFixed(sec % 60 ? 1 : 0);
const meter = (label, left, total, text) => `<div><div class="meter-top"><span>${label}</span><b>${text}</b></div><div class="bar ${left / total <= 0.2 ? 'low' : ''}"><i style="width:${total ? Math.max(0, Math.min(100, (left * 100) / total)) : 0}%"></i></div></div>`;
function usageMeters(a) {
  if (!a || a.unlimited || !a.limits) return '';
  return `<div class="meters">
    ${a.msgsUnlimited ? '<div><div class="meter-top"><span>AI messages</span><b>Unlimited</b></div><div class="bar"><i style="width:100%"></i></div></div>' : meter('AI messages left', a.msgsLeft, a.limits.msgs, `${a.msgsLeft} / ${a.limits.msgs}`)}
    ${a.plan === 'pro' ? meter('Live AI minutes left', a.proLiveLeft ?? 0, offer().proLive, `${a.proLiveLeft ?? 0} of ${offer().proLive} min`) : meter('Voice minutes left', a.voiceSecLeft, a.limits.voiceSec, `${mins(a.voiceSecLeft)} / ${mins(a.limits.voiceSec)}`)}
  </div>`;
}

function signInCard(headline = 'Practise with AI that knows your plan') {
  const o = offer();
  const buttons = native()
    ? `<div class="stack tight" style="max-width:300px">${window.PP_PLATFORM === 'ios' ? '<button class="btn primary block" data-act="nsignin" data-p="apple"> Sign in with Apple</button>' : ''}<button class="btn ${window.PP_PLATFORM === 'ios' ? '' : 'primary'} block" data-act="nsignin" data-p="google">Continue with Google</button></div>`
    : (S.googleClientId ? '<div id="gbtn"></div>' : `<p class="muted small">${S.healthLoaded ? 'Sign-in is being set up. Check back soon.' : 'Loading sign-in…'}</p>`);
  return `<section class="stack" id="accountCard" style="padding-top:8px">
    <div class="head"><h2>${esc(headline)}</h2>
    <p class="lede">Ask questions, have your answers graded, or rehearse out loud. It is free to try: ${o.freeMsgs} messages and ${o.freeVoice} voice minutes, no card needed.</p></div>
    ${buttons}
    <p class="muted small">Your plan and flashcards work without an account.</p>
    <details class="small"><summary class="muted" style="font-weight:400;justify-content:flex-start">Have a beta code?</summary>
      <form id="codeForm" class="row" style="margin-top:10px"><input id="code" type="password" value="${esc(store.accessCode())}" autocomplete="off" aria-label="Beta code"><button class="btn">Save code</button></form>
    </details>
  </section>`;
}

function accountCard() {
  const a = store.account();
  if (!signedIn()) return signInCard();
  if (a?.unlimited) {
    const name = a.name || a.email || 'Admin';
    return `<section class="panel stack" id="accountCard">
      <div class="row"><div class="avatar">${esc(name[0].toUpperCase())}</div>
        <div class="grow"><div class="row" style="gap:8px"><b style="overflow:hidden;text-overflow:ellipsis">${esc(name)}</b><span class="tag">Admin</span></div><div class="small muted">Admin account</div></div></div>
      ${ticks(['AI chat with no message or time limits', 'Live AI and voice with no session limits', 'Every topic, card and diagram unlocked', 'Guide suggestions from users, below'])}
      <div class="links">
        <a class="link quiet" href="support.html" target="_blank" rel="noopener">Support page</a>
        <a class="link quiet" href="privacy.html" target="_blank" rel="noopener">Privacy</a>
        <button class="link quiet" data-act="signout">Sign out</button>
      </div>
    </section>`;
  }
  if (!a) return `<section class="row between small muted"><span>${store.accessCode() ? 'Using a beta access code.' : 'Loading account…'}</span><button class="link quiet" data-act="signout">Sign out</button></section>`;
  const o = offer();
  const name = a.name || a.email || 'Signed in';
  const planTag = a.unlimited ? '<span class="tag">Admin</span>' : a.plan === 'pro' ? '<span class="tag pro">Pro</span>' : '<span class="tag">Free</span>';
  const sub = a.unlimited ? 'Unlimited AI' : a.plan === 'pro' && a.periodEnds ? `Allowance refills ${new Date(a.periodEnds).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}` : 'Free trial';
  return `<section class="panel stack" id="accountCard">
    <div class="row"><div class="avatar">${esc(name[0].toUpperCase())}</div>
      <div class="grow"><div class="row" style="gap:8px"><b style="overflow:hidden;text-overflow:ellipsis">${esc(name)}</b>${planTag}</div><div class="small muted">${esc(sub)}</div></div></div>
    ${usageMeters(a)}
    ${(() => { const { credits, left } = liveState(); return credits || left >= 20 ? `<p class="note">${left >= 20 ? `Live AI session in progress: ${Math.ceil(left / 60)} min left. ` : ''}${credits ? `${credits} Live AI session${credits > 1 ? 's' : ''} ready.` : ''} <button class="link" data-act="livesetup">${left >= 20 ? 'Rejoin' : 'Start'} →</button></p>` : ''; })()}
    ${a.plan === 'free' ? '<button class="btn primary block" data-act="plans">See pricing</button>' : ''}
    <div class="links">
      <button class="link quiet" data-act="plans">Pricing</button>
      ${native() && !a.unlimited ? '<button class="link quiet" data-act="restore">Restore purchases</button>' : ''}
      <a class="link quiet" href="privacy.html" target="_blank" rel="noopener">Privacy</a>
      <a class="link quiet" href="support.html" target="_blank" rel="noopener">Support</a>
      <button class="link quiet" data-act="signout">Sign out</button>
      ${a.key === 'code:admin' ? '' : '<button class="link quiet" data-act="delacct">Delete account</button>'}
    </div>
  </section>`;
}

function paywallCard() {
  const a = store.account();
  const o = offer();
  if (a?.plan === 'pro') {
    return `<section class="panel stack"><h3>This month's Pro allowance is used up</h3>
      <p class="muted">It refills ${a.periodEnds ? 'on ' + new Date(a.periodEnds).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : 'at your next billing period'}. A Live AI session is separate and works right now.</p>
      ${usageMeters(a)}<div class="row"><button class="btn primary" data-act="plans">See Live AI</button><button class="btn" data-act="unpaywall">Close</button></div></section>`;
  }
  return `<section class="panel stack"><h3>Your free trial is used up</h3>
    <p class="muted">Pro gives you unlimited AI messages and 30 Live AI minutes every month (only talk time counts). Your plan and flashcards stay free either way.</p>
    <div class="row"><button class="btn primary" data-act="plans">See pricing</button><button class="btn quiet" data-act="unpaywall">Not now</button></div></section>`;
}

function mountGoogleButton() {
  const el = document.getElementById('gbtn');
  if (el && !el.childElementCount) renderGoogleButton(el, S.googleClientId, msg => oops(msg)).catch(e => { el.textContent = e.message; });
}

// What this account gets from AI, said plainly before anyone has to ask.
function allowanceCard(a) {
  const o = offer();
  if (a?.unlimited) return '';
  if (a?.plan === 'pro') return `<section class="panel stack tight"><div class="row between"><b>Your Pro AI this month</b><span class="tag pro">Pro</span></div>
    ${usageMeters(a)}<p class="muted small">Live AI: ${a.proLiveLeft ?? o.proLive} of ${o.proLive} minutes left this month. Only the time you talk is counted. Need a full hour more? A one-time session is ${esc(o.livePrice)}.</p></section>`;
  return `<section class="panel stack tight"><b>Free to try</b>
    ${usageMeters(a)}
    <p class="muted small">Pro (${esc(o.proPrice)}): unlimited AI messages and ${o.proLive} Live AI minutes a month, counted only while you talk. <button class="link" data-act="plans">See pricing</button></p></section>`;
}

// The Live AI offer, one slim row that is always on the AI tab: the paid product, never buried.
// Chat list grouped by day, ChatGPT / Claude style. Lives in a left drawer (phone) or sidebar (wide).
function dayLabel(t) {
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const days = Math.floor((d0 - new Date(new Date(t).setHours(0, 0, 0, 0))) / 864e5);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Date(t).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(t).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}
/* ---------- What's new in tech: a light feed for when studying gets old ---------- */
const AREA_OF_ROLE = { java: 'java', spring: 'java', jvm: 'java', python: 'python', react: 'react', angular: 'angular', js: 'javascript', typescript: 'javascript', node: 'javascript', go: 'go', dotnet: 'dotnet', csharp: 'dotnet', k8s: 'kubernetes', docker: 'docker', cloud: 'cloud', sql: 'sql', data: 'data', spark: 'data', streaming: 'kafka', llm: 'ai', ml: 'ai', security: 'security', 'system-design': 'system-design' };
async function loadTrending() {
  if (S.trend?.loading || S.trend?.cards) return;
  S.trend = { loading: true };
  try { const r = await fetch(`content/trending.json?d=${new Date().toISOString().slice(0, 13)}`); S.trend = await r.json(); }
  catch { S.trend = { cards: [], failed: true }; }
  if (S.view === 'trend') render();
}
const ago = t => { const h = Math.floor((Date.now() - t) / 36e5); return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`; };
function trendView() {
  const T = S.trend;
  if (!T?.cards) { loadTrending(); return '<div class="tf"><h1>What’s new in tech</h1><p class="muted">Loading…</p></div>'; }
  // The user's own stack first, newest within each.
  const mine = new Set(rankTopics(topics(), profile()).flatMap(t => Object.entries(AREA_OF_ROLE).filter(([k]) => t.id.includes(k)).map(([, v]) => v)));
  const scope = S.tfScope || 'dev';
  const cards = [...T.cards].filter(c => (c.kind || 'dev') === scope).sort((a, b) => (mine.has(b.area) ? 864e5 : 0) + b.date - ((mine.has(a.area) ? 864e5 : 0) + a.date));
  const pro = hasPro() || isAdmin();
  const shown = pro ? cards : cards.slice(0, 6);
  // One story per screen, swipe up for the next (snap scroll).
  return `<div class="tf-scope" role="tablist"><button role="tab" class="${scope === 'dev' ? 'on' : ''}" data-act="tfscope" data-v="dev">For you</button><button role="tab" class="${scope === 'world' ? 'on' : ''}" data-act="tfscope" data-v="world">Tech world</button></div>
  <div class="tf tf-snap" id="tfSnap">
    ${shown.map((c, i) => `<article class="tf-item">
      <div class="tf-card">
        <p class="tf-meta">${esc(c.source)} · ${ago(c.date)}</p>
        <h2>${esc(c.title)}</h2>
        <p>${esc(c.what)}</p>
        ${c.why ? `<p class="tf-why">${esc(c.why)}</p>` : ''}
        <details class="tf-q"><summary>${esc(c.q)}</summary><p>${esc(c.a)}</p></details>
        <a class="tf-src" href="${esc(c.url)}" target="_blank" rel="noopener">Read the source</a>
      </div>
      ${i === 0 ? '<p class="tf-hint">Swipe up for the next story</p>' : ''}
    </article>`).join('') || '<article class="tf-item"><div class="tf-card"><p class="muted">Nothing new yet today. Check back later.</p></div></article>'}
    ${pro || cards.length <= 6 ? '<article class="tf-item tf-end"><div class="tf-card"><h2>You’re all caught up</h2><p>New stories arrive every day.</p></div></article>' : `<article class="tf-item tf-end"><div class="tf-card"><h2>${cards.length - 6} more stories today</h2><p>The full feed comes with Pro.</p><button class="btn primary" data-act="plans">Try Pro free for 3 days</button></div></article>`}
  </div>`;
}

/* App-wide side panel, ChatGPT style: sections, recent chats, New chat + profile. */
function navDrawerHtml(key) {
  const a = store.account(), list = store.chats(), cur = store.chatCur();
  const name = a?.name || a?.email || 'You';
  const initials = name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'Y';
  const item = (v, label, icon, on) => `<button class="nd-item ${on ? 'on' : ''}" data-act="ndgo" data-v="${v}">${ic(icon)}<span>${label}</span></button>`;
  const showAll = S.ndAll || list.length <= 6;
  let chats = '';
  if (showAll) {
    const groups = [];
    for (const c of list) { const g = dayLabel(c.at); const last = groups[groups.length - 1]; if (last?.label === g) last.items.push(c); else groups.push({ label: g, items: [c] }); }
    chats = groups.map(g => `<span class="nd-day">${esc(g.label)}</span>${g.items.map(c => `<button class="nd-chat-item ${key === 'chat' && c.id === cur ? 'on' : ''}" data-act="ndchat" data-id="${c.id}">${esc(c.title)}</button>`).join('')}`).join('');
  } else chats = list.slice(0, 6).map(c => `<button class="nd-chat-item ${key === 'chat' && c.id === cur ? 'on' : ''}" data-act="ndchat" data-id="${c.id}">${esc(c.title)}</button>`).join('');
  return `<aside class="nd" aria-label="Menu">
    <div class="nd-head"><b>PrepPilot</b><span class="nd-head-btns"><button class="nd-round" data-act="ndgo" data-v="search" aria-label="Search topics">${ic('search')}</button><button class="nd-round nd-menu" data-act="drawer" aria-label="Close panel">${ic('menu')}</button></span></div>
    <nav class="nd-nav">
      ${item('home', 'Home', 'home', key === 'home')}
      ${item('deck', 'Cards', 'cards', key === 'deck')}
      ${item('jobfocus', 'Role Ready', 'target', key === 'focus')}
      ${item('lab', 'Interview Lab', 'book', key === 'lab')}
      ${item('live', 'Live AI interview', 'mic', false)}
      ${item('custom', 'Custom subjects', 'plus', key === 'custom')}
      ${hasPro() || isAdmin() ? '' : item('plans', 'Pricing', 'spark', false)}
    </nav>
    <div class="nd-chats">${list.length ? `<span class="nd-sec">Chats</span>${chats}${list.length > 6 ? `<button class="nd-more" data-act="ndall">${S.ndAll ? 'Show less' : 'See all…'}</button>` : ''}` : '<p class="nd-empty">Your chats with the AI coach appear here.</p>'}
      <p class="nd-privacy">${ic('lock')}Chats stay on this device. No memory is kept.</p></div>
    <div class="nd-foot"><button class="nd-new" data-act="ndnewchat">${ic('edit')}Chat</button><button class="nd-av" data-act="ndgo" data-v="settings" aria-label="Profile">${esc(initials)}</button></div>
  </aside>`;
}
function syncDrawer(key) {
  // Same layout signed in or not: the old bottom tabs are gone for everyone.
  const on = !!(profile() && !['landing', 'login', 'onboard', 'plans'].includes(key));
  document.body.classList.toggle('has-drawer', on);
  document.body.classList.toggle('drawer-open', on && !!S.drawer);
  const el = document.getElementById('appDrawer');
  if (el) el.innerHTML = on ? navDrawerHtml(key) : '';
}
function setDrawer(open) {
  S.drawer = open;
  document.body.classList.toggle('drawer-open', !!open && document.body.classList.contains('has-drawer'));
}
// Tapping the slid-away page closes the panel.
document.addEventListener('click', e => {
  if (!document.body.classList.contains('drawer-open') || window.innerWidth >= 900) return;
  if (e.target.closest('#shell') && !e.target.closest('.menu-btn')) { e.preventDefault(); e.stopPropagation(); setDrawer(false); }
}, true);

function chatDrawerHtml() {
  const list = store.chats(), cur = store.chatCur();
  const groups = [];
  for (const c of list) { const g = dayLabel(c.at); const last = groups[groups.length - 1]; if (last?.label === g) last.items.push(c); else groups.push({ label: g, items: [c] }); }
  return `<aside class="ai-drawer ${S.drawer ? 'open' : ''}" aria-label="Chats">
    <div class="ai-drawer-top"><button class="btn block ai-newchat" data-act="newchat">${ic('edit')}New chat</button></div>
    <nav class="ai-days">${groups.map(g => `<div class="ai-day"><span class="ai-day-l">${esc(g.label)}</span>${g.items.map(c => `<div class="ai-chat ${c.id === cur ? 'on' : ''}"><button data-act="openchat" data-id="${c.id}" title="${esc(c.title)}">${esc(c.title)}</button><button class="ai-del" data-act="delchat" data-id="${c.id}" aria-label="Delete chat">${ic('x')}</button></div>`).join('')}</div>`).join('') || '<p class="muted small" style="padding:0 14px">Your chats will appear here, grouped by day.</p>'}</nav>
    <p class="ai-privacy">${ic('lock')}<span>Chats are saved only on this device. PrepPilot doesn’t store them or keep a memory of you; the coach only sees the chat you’re in.</span></p>
  </aside>${S.drawer ? '<button class="ai-scrim" data-act="drawer" aria-label="Close chats"></button>' : ''}`;
}

function liveStrip() {
  const { credits, left } = liveState();
  const a = store.account(), o = offer();
  const pro = a?.plan === 'pro';
  const [sub, label, act] = isAdmin() ? ['Admin · no limits', 'Start', 'livesetup']
    : left >= 20 ? [`Session open · ${Math.ceil(left / 60)} min left`, 'Rejoin', 'livesetup']
    : credits ? [`${credits} session${credits > 1 ? 's' : ''} ready · voice, graded`, 'Start', 'livesetup']
    : pro ? [`${a?.proLiveLeft ?? o.proLive} of ${o.proLive} min left · only talk time counts`, 'Start', 'livesetup']
    : [`${o.liveMin}-min session · ${o.livePrice} · clock runs once started`, 'Try it', 'plans'];
  return `<section class="live-strip" aria-label="Live AI mock interview">
    <span class="ls-wave" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i style="--w:${i}"></i>`).join('')}</span>
    <div class="grow"><b>Live AI mock interview</b><span>${esc(sub)}</span></div>
    <button class="btn invert" data-act="${act}">${label}</button></section>`;
}

function chatView() {
  const msgs = store.chat();
  const live = S.live ? `<div class="msg assistant" id="liveMsg">${mdChat(S.live.text) || '<span class="dots"><i></i><i></i><i></i></span>'}</div>` : '';
  if (!signedIn()) return signInCard();
  const a = store.account();
  const bubble = m => m.role === 'user' && m.content === '🎙 …' ? `<div class="msg user heard" id="heardMsg">${esc(S.heard || '') || '🎙 …'}</div>` : isNotice(m) ? `<div class="msg sys">${fmt(m.content.replace(/^(ℹ️|⚠️)\s*/, ''))}</div>` : `<div class="msg ${m.role}">${m.role === 'assistant' ? mdChat(m.content) : fmt(m.content)}</div>`;
  const started = msgs.length || live;
  const lowFree = a?.plan === 'free' && !S.paywall && a.msgsLeft <= 5;
  const f = S.fresh;
  const prompts = [
    ['Quiz me on my weakest topic', 'Quiz me on my weakest topic, one question at a time, easy first'],
    ['Grade an answer', 'I will give you my answer to an interview question. Grade it strictly and tell me what is missing.'],
    ['Explain something simply', 'Explain the hardest topic in my plan simply, with one example'],
    ['Senior panel questions', 'What would a senior panel ask about my background?'],
  ];
  // After a few messages, one gentle nudge towards saying it out loud.
  const nudge = !S.rt && msgs.filter(m => m.role === 'assistant').length >= 3 && !isAdmin() ? `<button class="live-nudge" data-act="${liveState().credits || store.account()?.plan === 'pro' ? 'livesetup' : 'plans'}">${ic('mic')}<span>Ready to say it out loud? <b>Run a Live AI mock interview</b></span>${ic('right')}</button>` : '';
  const cur = store.chats().find(c => c.id === store.chatCur());
  return `<div class="ai-layout"><div class="stack chat ai-tab">
    <div class="ai-head">
      <h1 class="ai-title">${esc(cur?.title || 'AI coach')}</h1>
      ${S.rt || S.livePaused ? '<span></span>' : `<button class="iconbtn plain" data-act="newchat" aria-label="New chat" title="New chat">${ic('edit')}</button>`}</div>
    ${S.rt || S.livePaused ? '' : S.paywall ? paywallCard() : liveStrip()}
    ${S.rtMode === 'live' && S.liveHint ? liveHintCard() : ''}
    ${S.chatContext ? `<p class="note row between"><span>Talking about <b>${esc(S.chatContext.split('\n')[0])}</b></span><button class="link quiet" data-act="dropctx">Remove</button></p>` : ''}
    <div class="msgs" id="msgs">${started ? msgs.map(bubble).join('') : `<div class="ai-hello"><h2>How can I help you prepare?</h2><p class="muted small">Ask anything, or pick one to start.</p></div>
      <div class="ai-prompts">${prompts.map(([l, q]) => `<button class="chip" data-act="quick" data-q="${esc(q)}">${esc(l)}</button>`).join('')}
        ${f?.title ? `<button class="chip fresh-chip" data-act="quick" data-q="${esc(`Interview me on this real scenario. ${f.situation} ${f.question} Ask one question at a time.`)}">${ic('spark')}Today’s scenario: ${esc(f.title)}</button>` : ''}
        ${S.voiceServer && realtimeSupported ? `<button class="chip" data-act="rtstart" data-mode="talk">${ic('mic')}Talk it through</button>` : ''}</div>`}
    ${live}${S.busy ? '<div class="msg assistant"><span class="dots"><i></i><i></i><i></i></span></div>' : ''}</div>
    ${nudge}
    ${lowFree && !S.rt ? `<p class="note row between small"><span>${a.msgsLeft} free message${a.msgsLeft === 1 ? '' : 's'} left.</span><button class="link" data-act="plans">See Pro</button></p>` : ''}
    <div class="ai-dock">${S.rt || S.livePaused ? voicePanel() : ''}<form id="chatForm" class="composer">
      <textarea id="chatInput" rows="1" maxlength="2000" placeholder="${S.rt ? 'Or type your reply' : 'Message the AI coach'}" aria-label="Message"></textarea>
      ${S.rt ? '' : `<button type="button" class="iconbtn plain ${store.speak() ? 'on' : ''}" data-act="speak" aria-pressed="${store.speak()}" aria-label="Read replies aloud" title="Read replies aloud">${ic(store.speak() ? 'sound' : 'soundoff')}</button>`}
      ${S.rt ? '' : `<button type="button" class="iconbtn ${S.listening ? 'on' : 'plain'}" data-act="mic" ${voice.canListen ? '' : 'disabled'} aria-label="${S.listening ? 'Stop dictation' : 'Dictate'}" title="${voice.canListen ? 'Dictate' : 'Dictation is not supported here'}">${ic(S.listening ? 'stop' : 'mic')}</button>`}
      <button class="iconbtn primary" type="submit" ${S.busy ? 'disabled' : ''} aria-label="Send">${ic('send')}</button>
    </form></div>
  </div></div>`;
}

/* ---------- Live AI ---------- */
// Voices the AI can speak in (all natural-sounding; Marin and Cedar are the newest).
const LIVE_VOICES = [['marin', 'Marin: warm, relaxed'], ['cedar', 'Cedar: calm, deep'], ['coral', 'Coral: bright, upbeat'], ['ash', 'Ash: easy-going'], ['sage', 'Sage: gentle, thoughtful'], ['verse', 'Verse: expressive']];
function liveSettings() {
  const p = profile();
  const saved = store.liveSettings() || {};
  return {
    lengthMin: 240,
    voice: saved.voice !== false,
    style: ['friendly', 'direct', 'tough'].includes(saved.style) ? saved.style : 'friendly',
    speaker: 'marin', // one voice for everyone: the one users liked, and no extra wait
    topic: typeof saved.topic === 'string' ? saved.topic : '',
    difficulty: ['junior', 'mid', 'senior'].includes(saved.difficulty) ? saved.difficulty : (p?.level || 'mid'),
    use: saved.use === 'interview' ? 'interview' : 'talk',
  };
}

function liveSetupSheet() {
  const s = liveSettings();
  // "During your interview" is server-gated (default off). A saved 'interview'
  // choice from before the flag existed falls back to the practice test, so
  // the sheet never renders with no option selected.
  const use = S.liveInterviewIos ? s.use : (s.use === 'interview' ? 'practice' : s.use);
  const p = profile();
  const relevant = rankTopics(topics(), p);
  const { credits, left } = liveState();
  const pro = store.account()?.plan === 'pro' || store.account()?.unlimited;
  const proLeft = store.account()?.proLiveLeft ?? 0, proWin = store.account()?.proLiveSecLeft || 0;
  const admin = isAdmin();
  const fromPlan = !admin && left < 20 && !credits && pro && proWin >= 60;
  const state = admin ? 'Admin account: no limits.' : left >= 20 ? `Your session is still open with ${Math.ceil(left / 60)} minutes left.` : credits ? `You have ${credits} one-time session${credits > 1 ? 's' : ''} ready. Heads up: starting one begins a fixed 60-minute clock. It keeps running if you leave, and unused minutes are not given back.` : fromPlan ? `Included in Pro: ${proLeft} of ${offer().proLive} minutes left this month. Only the time you are connected is counted, so you can stop and come back any time.` : 'You need a Live AI session to start. See pricing for the options.';
  const opt = (v, t, d) => `<label class="use-opt"><input type="radio" name="use" value="${v}" ${use === v ? 'checked' : ''}><span><b>${t}</b><span class="muted small">${d}</span></span></label>`;
  sheet(`<form id="liveSetupForm" class="stack">
    <div class="lv-head"><span class="ls-wave lv-wave" aria-hidden="true">${Array.from({ length: 5 }, (_, i) => `<i style="--w:${i}"></i>`).join('')}</span>
      <div class="grow"><h2>Live AI</h2><span class="muted small">Interview, quiz, explain. Just talk.</span></div>
      ${admin ? '' : fromPlan ? `<span class="lv-pill">${Math.floor(proWin / 60)} min left</span>` : left >= 20 ? `<span class="lv-pill">${Math.ceil(left / 60)} min left</span>` : credits ? `<span class="lv-pill">${credits} ready</span>` : ''}</div>
    ${fromPlan ? `<div class="lv-bar" aria-hidden="true"><i style="width:${Math.min(100, Math.round(proWin / 36))}%"></i></div><p class="muted small" style="margin:-6px 0 0">Only talk time counts.</p>`
      : credits && left < 20 ? '<p class="muted small" style="margin:0">One fixed 60-minute session. The clock starts when you begin.</p>'
      : admin || left >= 20 ? '' : `<p class="muted small" style="margin:0">${esc(state)}</p>`}
    <input type="hidden" name="use" value="${use === 'interview' ? 'interview' : 'talk'}">
    ${S.liveBrief?.jd ? `<p class="lv-brief-on">${ic('target')}Mock interview for <b>${esc(S.jf?.result?.role || 'your role')}</b>, using your résumé. <button type="button" class="link quiet small" data-act="jfbriefoff">Turn off</button></p>` : ''}
    <label>Topic focus<select name="topic"><option value="">All my topics</option>${relevant.map(t => `<option value="${esc(t.name)}" ${s.topic === t.name ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    <details class="lv-custom practice-only" ${use === 'interview' ? 'hidden' : ''}><summary><span>Customize</span><span class="muted small">${s.style} · ${esc((LEVELS.find(l => l.id === s.difficulty)?.name || s.difficulty).split(' ')[0])}</span></summary><div class="stack">
      <label>AI style<select name="style">${[['friendly', 'Friendly and encouraging'], ['direct', 'Direct, no small talk'], ['tough', 'Tough, probes every gap']].map(([v, n]) => `<option value="${v}" ${s.style === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Difficulty<select name="difficulty">${LEVELS.map(l => `<option value="${l.id}" ${s.difficulty === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>
      <label class="switch"><input type="checkbox" name="voice" ${s.voice ? 'checked' : ''}>AI speaks out loud</label>
    </div></details>
    <p class="muted small" style="margin:0">Runs until you end or pause it. We'll give you a heads-up 5 minutes before your time runs out.</p>
    <p class="note small interview-only" ${use === 'interview' ? '' : 'hidden'}>Put this device where its microphone can hear your interviewer. Check that transcribing the call is allowed by the company and where you live; some places require everyone on a call to agree.</p>
    <button class="btn primary block lg" type="submit">${left >= 20 ? 'Rejoin the session' : credits || fromPlan || admin ? 'Start' : 'See pricing'}</button>
    <button class="btn block" type="button" data-act="closesheet">Not now</button>
  </form>`);
}

function liveHintCard() {
  const h = S.liveHint;
  if (!h) return '';
  return `<section class="panel stack live-hint ${h.loading ? 'is-loading' : ''}"><div class="label">How to answer</div>
    <p class="lh-q muted small">${esc(h.question)}</p>
    ${h.loading ? '<div class="lh-skel" aria-hidden="true"><i></i><i></i><i></i></div>' : `<p style="font:400 1.05rem/1.6 var(--serif)">${esc(h.hint)}</p>
    ${h.strong ? `<div><div class="label">Points a strong answer covers</div><p class="muted" style="font:400 1.05rem/1.6 var(--serif)">${esc(h.strong)}</p></div>` : ''}`}
    <p class="muted small">Hints are for practice. AI is here to help you prepare.</p>
  </section>`;
}

/* ---------- guide suggestions ---------- */
// One form, two places: the ask-once sheet after Google sign-in, and Profile.
// The address suggestions go to lives on the server (SUGGESTIONS_EMAIL),
// never in client code. Fields are found by role, not id, so the two copies
// can share the page with the sheet open.
function suggestFormHtml(id) {
  return `<form id="${id}" class="suggest-form stack">
    <label class="small muted" for="${id}-text">What guide or topic should we add?</label>
    <textarea id="${id}-text" rows="3" maxlength="500" minlength="10" required placeholder="e.g. A guide to system design interviews for backend roles"></textarea>
    <input maxlength="120" placeholder="Topic (optional)" aria-label="Topic">
    <button class="btn primary block" type="submit">Send suggestion</button>
  </form>`;
}

function suggestSheet() {
  sheet(`<h2>What should we teach next?</h2>
    <p class="muted">You are signed in — tell us what guide or topic you want and we will look at adding it.</p>
    ${suggestFormHtml('suggestForm')}
    <button class="btn block" type="button" data-act="closesheet">Not now</button>`);
}

async function submitSuggestion(form) {
  if (!signedIn()) { toast('Sign in first, then send your suggestion.'); return; }
  const text = form.querySelector('textarea').value.trim();
  const topic = form.querySelector('input').value.trim();
  if (text.length < 10) { oops('Tell us what guide or topic you want (at least 10 characters).'); return; }
  const btn = form.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;
  try {
    await ai.post('/api/suggestions', { text, topic });
    closeSheet();
    toast('Thanks — your suggestion is in. We read every one.');
    render();
  } catch (err) { aiFailed(err); }
  if (btn) btn.disabled = false;
}

async function fetchLiveHint(question) {
  S.liveHint = { question, hint: '', strong: '', showStrong: false, loading: true };
  render();
  try {
    const d = await ai.post('/api/live/hint', { question });
    S.liveHint = { question, hint: d.hint || '', strong: d.strong || '', showStrong: S.liveHint?.showStrong || false, loading: false };
  } catch { S.liveHint = null; }
  if (S.view === 'chat') render();
}

/* ---------- realtime voice ---------- */
function paintVoice() {
  const st = document.getElementById('rtStatus'), orb = document.getElementById('rtOrb'), tm = document.getElementById('rtTimer');
  if (st) st.textContent = S.muted ? 'Muted' : STATUS[S.rtStatus] || S.rtStatus;
  if (orb) orb.className = `pulse status-${S.rtStatus} ${S.muted ? 'muted' : ''}`;
  if (tm && S.rt) {
    const left = S.rt.endsAt ? Math.max(0, (S.rt.endsAt - Date.now()) / 1000) : null;
    tm.textContent = `${MODE_NAME[S.rtMode] || ''}${left === null ? '' : `, ${clock(left)} left`}`;
    tm.classList.toggle('low', left !== null && left < 300);
  }
}
setInterval(() => { if (S.rt) paintVoice(); }, 1000);

function rtHandlers() {
  return {
    status(s) { S.rtStatus = s; paintVoice(); },
    userStart() {
      // Placeholder so the user's words appear before the AI reply even if transcription lands later.
      if (!S.pendingUser) { store.setChat([...store.chat(), { role: 'user', content: '🎙 …' }]); S.pendingUser = true; if (!S.live) render(); }
    },
    heard(text) {
      S.heard = (S.heard || '') + text;
      const el = document.getElementById('heardMsg');
      if (el) { el.textContent = S.heard; scrollEnd(); }
    },
    user(text) {
      S.heard = '';
      const msgs = store.chat();
      const i = msgs.map(m => m.content).lastIndexOf('🎙 …');
      if (i >= 0) msgs[i] = { role: 'user', content: text.trim() || '(inaudible)' };
      else if (text.trim()) msgs.push({ role: 'user', content: text.trim() });
      store.setChat(msgs); S.pendingUser = false;
      // In a practice test, once the user has answered, show what a strong answer would add.
      if (S.rtMode === 'live' && S.liveHint && text.trim()) S.liveHint.showStrong = true;
      if (!S.live) render();
    },
    delta(id, text) {
      if (S.liveUse === 'interview' && /^[.…\s]*$/.test((S.live?.id === id ? S.live.text : '') + text)) { if (!S.live || S.live.id !== id) S.live = { id, text: '', hidden: true }; S.live.text += text; return; }
      if (S.live?.hidden && S.live.id === id) { S.live.hidden = false; render(); }
      if (!S.live || S.live.id !== id) { S.live = { id, text: '' }; S.pendingUser = false; render(); }
      S.live.text += text;
      // Practice test: the moment the coach's question is out, start the answer points, while it is still speaking.
      if (S.rtMode === 'live' && S.liveUse !== 'interview' && S.hintFor !== id && S.live.text.includes('?')) {
        S.hintFor = id; fetchLiveHint(S.live.text.slice(0, S.live.text.lastIndexOf('?') + 1).trim().slice(-400));
      }
      const el = document.getElementById('liveMsg');
      if (el) { el.innerHTML = mdChat(S.live.text); scrollEnd(); }
    },
    done(id, text) {
      const final = text ?? S.live?.text ?? '';
      S.live = null;
      const skip = S.liveUse === 'interview' && /^[.…\s]*$/.test(final);
      if (final.trim() && !skip) store.setChat([...store.chat(), { role: 'assistant', content: final }]);
      // In a practice test, a finished question gets an instant hint.
      if (S.rtMode === 'live' && S.liveUse !== 'interview' && S.hintFor !== id && /\?\s*$/.test(final.trim())) { S.hintFor = id; fetchLiveHint(final.trim()); }
      render();
    },
    end(reason) {
      const wasLive = S.rtMode === 'live';
      if (S.livePausing) {
        S.livePausing = false;
        S.livePaused = { oneTime: !S.rtFromPlan };
        S.rt = null; S.rtMode = null; S.rtStatus = ''; S.live = null; S.pendingUser = false; S.heard = ''; S.hintFor = null;
        store.setChat(store.chat().filter(m => m.content !== '🎙 …'));
        refreshAccount().catch(() => {});
        if (S.view === 'chat') render();
        return;
      }
      const retry = wasLive && /^Connection lost/.test(reason || '') && (S.liveRetries || 0) < 3;
      S.rt = null; S.rtMode = null; S.rtStatus = ''; S.live = null; S.pendingUser = false; S.muted = false; S.soundOff = false; S.rtSpeaks = false; S.heard = ''; S.hintFor = null; S.liveHint = null; S.liveUse = null;
      store.setChat(store.chat().filter(m => m.content !== '🎙 …'));
      if (reason) store.setChat([...store.chat(), { role: 'assistant', content: `ℹ️ ${reason}` }]);
      if (retry) {
        S.liveRetries = (S.liveRetries || 0) + 1;
        store.setChat([...store.chat().filter(m => !isNotice(m) || m.content !== `ℹ️ ${reason}`), { role: 'assistant', content: 'ℹ️ Connection dropped. Reconnecting to the same session…' }]);
        setTimeout(() => startVoice('live'), 1500);
      } else S.liveRetries = 0;
      if (wasLive) refreshAccount().catch(() => {}); // remaining session time for the "rejoin" button
      if (S.view === 'chat') render();
    },
  };
}

function pauseLive(auto) {
  if (S.rtMode !== 'live' || !S.rt) return;
  S.livePausing = true;
  S.rt.stop();
  if (auto) {
    const body = S.livePaused?.oneTime ? 'Tap to pick up where you left off.' : 'Your minutes stopped counting. Tap to pick up where you left off.';
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'liveNotice', title: 'Live AI paused', body }));
    store.setChat([...store.chat(), { role: 'assistant', content: 'ℹ️ Paused when you left the app. Tap Resume to carry on.' }]);
  }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseLive(true); });

async function startVoice(mode) {
  if (!(S.voiceServer && realtimeSupported)) return oops('Live voice isn\'t available on this device right now.');
  if (S.rtStarting) return;
  if (S.rt) S.rt.stop();
  voice.stopSpeaking();
  const session = new VoiceSession(rtHandlers());
  S.rt = session; S.rtMode = mode; S.rtStatus = 'connecting'; S.rtStarting = true; S.paywall = false; render();
  try {
    // Rehearse mode stays silent unless "read replies aloud" is on; talk mode is always spoken.
    // Live AI uses its own settings: voice on/off, length, style, topic focus, difficulty.
    const live = mode === 'live' ? liveSettings() : null;
    if (live && S.liveBrief) live.brief = S.liveBrief;
    S.livePaused = null;
    S.liveUse = live?.use || null;
    const speak = mode === 'live' ? live.voice && live.use !== 'interview' : mode !== 'listen' || store.speak();
    S.rtSpeaks = speak; S.soundOff = false; S.heard = '';
    await session.start({ mode, speak, profileSummary: summary(), context: S.resumeCtx || S.chatContext, live, noIdle: isAdmin() });
    S.resumeCtx = '';
    S.rtFromPlan = !!session.fromPlan;
  } catch (e) {
    S.rt = null; S.rtMode = null;
    if (e.code === 'quota') S.paywall = true;
    if (e.code === 'no_credit') { refreshAccount().catch(() => {}); oops('No Live AI session on this account yet.'); }
    else store.setChat([...store.chat(), { role: 'assistant', content: `⚠️ ${e.message}` }]);
  } finally { S.rtStarting = false; render(); }
}

// Admin: guide suggestions from users (stored on the server; no email is sent).
function adminSuggestions() {
  if (!S.adminSug) { S.adminSug = { loading: true, list: [] }; ai.post('/api/suggestions/list', {}).then(d => { S.adminSug = { list: d.suggestions || [] }; if (S.view === 'settings') render(); }).catch(e => { S.adminSug = { error: e.message, list: [] }; if (S.view === 'settings') render(); }); }
  const g = S.adminSug;
  return `<section class="stack"><div class="sec-head"><h3>Suggestions from users</h3><button class="link quiet small" data-act="reloadsug">Refresh</button></div>
    ${g.loading ? '<p class="muted">Loading…</p>' : g.error ? `<p class="note warn">${esc(g.error)}</p>` : !g.list.length ? '<p class="muted">No suggestions yet.</p>'
      : `<div class="rows">${g.list.map(x => `<div class="rowi static"><span class="main"><span class="t">${esc(x.topic || 'Suggestion')}</span><span class="muted small" style="white-space:normal">${esc(x.text)}</span><span class="muted small">${esc(new Date(x.createdAt).toLocaleString())}${x.userEmail ? ' · ' + esc(x.userEmail) : ''}</span></span></div>`).join('')}</div>`}
  </section>`;
}

// Profile: who you are, what you're preparing for, how the app looks. Progress lives on Home.
function prepSummary() {
  const p = profile();
  if (!p) return '';
  const m = migrateProfile(p);
  const roles = m.roleIds.map(id => id === 'other' ? p.otherRole : roleName(id)).filter(Boolean).join(', ');
  const days = daysUntil(p.interviewDate || p.date);
  const r = readiness(rankTopics(topics(), p), p, store.progress());
  const streak = streakDays(store.activity(), todayKey());
  if (S.editProfile) return `<section class="stack"><div class="sec-head"><h2>Your prep</h2><button class="link quiet small" data-act="editprofile">Done</button></div>${onboardingView(p)}</section>`;
  return `<section class="pf-prep">
    <div class="sec-head"><h2>Your prep</h2><button class="btn small" data-act="editprofile">Edit</button></div>
    <dl class="pf-facts">
      <div><dt>Role</dt><dd>${esc(roles || '—')}</dd></div>
      <div><dt>Level</dt><dd>${esc((LEVELS.find(l => l.id === p.level) || {}).name || p.level || '—')}</dd></div>
    </dl>
    <div class="pf-nums"><span><b>${r.pct}%</b>ready</span><span><b>${r.known}</b>cards known</span><span><b>${streak}</b>day streak</span></div>
  </section>`;
}
function prefsSection() {
  const ts = textSize(), dm = deckMode();
  const seg = (act, cur, opts) => `<div class="pf-seg" role="radiogroup">${opts.map(([v, l, label]) => `<button role="radio" aria-checked="${cur === v}" aria-label="${label || l}" class="${cur === v ? 'on' : ''}" data-act="${act}" data-v="${v}">${l}</button>`).join('')}</div>`;
  return `<section class="pf-prefs">
    <h2>Display</h2>
    <div class="pf-row"><div><b>Text size</b><span class="muted small">Lessons, cards and answers</span></div>${seg('textsize', ts, [['s', '<span class="ts-s">A</span>', 'Small'], ['m', '<span class="ts-m">A</span>', 'Medium'], ['l', '<span class="ts-l">A</span>', 'Large']])}</div>
    ${pipSupport() && !native() ? `<div class="pf-row"><div><b>Float cards automatically</b><span class="muted small">Your first click on PrepPilot opens the floating cards, so they stay on top of your other apps</span></div>${seg('pipauto', lsGet('pp.pipAuto', 'on'), [['off', 'Off'], ['on', 'On']])}</div>` : ''}
    <div class="pf-row"><div><b>Cards open in</b><span class="muted small">Switch any time on the cards screen</span></div>${seg('prefmode', dm, [['steady', 'Steady'], ['swipe', 'Swipe']])}</div>
  </section>`;
}
function settingsView() {
  const priv = store.privatePacks();
  return `<div class="stack loose">
    ${accountCard()}
    ${store.account()?.unlimited ? adminSuggestions() : ''}
    ${prepSummary()}
    ${prefsSection()}
    <details class="pf-more"><summary>More</summary><div class="stack loose" style="margin-top:16px">
    <section class="stack"><div class="head"><h2>Private packs</h2>
      <p class="muted">Import your own pack as a JSON file: your projects, your stories. It never leaves this device.</p></div>
      <input type="file" id="importPack" accept="application/json,.json" aria-label="Import pack">
      ${priv.length ? `<div class="rows">${priv.map(p => `<div class="rowi static"><span class="main"><span class="t">${esc(p.name)}</span><span class="d">${p.topics.length} topics</span></span><button class="link quiet small" data-act="delpack" data-id="${esc(p.id)}">Remove</button></div>`).join('')}</div>` : ''}
    </section>
    <section class="stack"><div class="head"><h2>Suggest a guide</h2>
      <p class="muted">Want a guide or topic we don't cover? Tell us — it goes straight to the people who write them.</p></div>
      ${suggestFormHtml('suggestFormSettings')}
    </section>
    <section class="stack"><div class="head"><h2>Your data</h2>
      <p class="muted">Your profile, progress and chats are stored only on this device.</p></div>
      <div class="row"><button class="btn" data-act="export">Export my data</button><button class="btn danger" data-act="reset">Erase everything</button></div>
    </section>
    </div></details>
  </div>`;
}

function customView() {
  const custom = store.customTopics();
  const p = profile();
  const prog = store.progress();
  const reason = customLimitReason();
  const atCap = custom.length >= CUSTOM_LIMIT;
  const rows = custom.map(t => {
    const tr = readiness([t], p, prog);
    return `<div class="rowi static"><span class="main"><span class="t">${esc(t.name)}</span><span class="d">${t.concepts.length} lessons · ${t.qa.length} questions${tr.total ? ` · ${tr.pct}% known` : ''}</span></span>
      <span class="row"><button class="link quiet small" data-act="learn" data-id="${t.id}">Open</button><button class="link quiet small" data-act="deck" data-id="${t.id}">Practice</button><button class="link quiet small" data-act="delcustom" data-id="${t.id}">Delete</button></span></div>`;
  }).join('');
  return `<div class="stack loose">
    <div class="head"><h1>Your subjects</h1>
      <p class="lede">Anything your interview covers that the 72 built-in topics don't — Ansible, Puppet, a tool only your team uses. AI writes the full guide: lessons told like a story, plus flashcards.</p></div>
    <section class="cs-panel">
      <div class="card-head"><span>Custom subjects</span><span>${custom.length} of ${CUSTOM_LIMIT}</span></div>
      ${reason === 'pro'
        ? `<p class="muted">Custom subjects are part of Pro. The subjects you already have stay usable either way.</p><div class="row"><button class="btn primary" data-act="plans">See pricing</button></div>`
        : reason === 'signin'
          ? `<p class="muted">Sign in to write a custom subject.</p>`
          : `${S.busy ? `<ol class="gen-steps" aria-live="polite"><li>Reading up on the subject</li><li>Writing short lessons</li><li>Writing interview questions</li><li>Checking the answers</li></ol>` : ''}<form id="customForm" class="row cs-form"><input id="customTopic" maxlength="120" placeholder="e.g. Ansible" required aria-label="Subject"><button class="btn primary" ${S.busy || atCap ? 'disabled' : ''}>${S.busy ? 'Writing your guide…' : 'Generate my guide'}</button></form>
          <p class="muted small">Uses 5 AI messages. ${atCap ? `You have all ${CUSTOM_LIMIT} subjects — delete one to make room.` : `You can keep up to ${CUSTOM_LIMIT} subjects.`}</p>`}
      ${custom.length ? `<div class="rows" style="margin-top:14px">${rows}</div>` : `<p class="muted" style="margin-top:14px">No custom subjects yet.</p>`}
    </section>
    <p class="muted small">Custom subjects sit alongside the built-in topics everywhere — your plan, your stats, and the story diagram AI draws for them.</p>
  </div>`;
}

// A health-app-style picture of where the user stands: rings for readiness,
// voice and today, a practice streak, a 14-day trend, per-topic readiness,
// the weakest spots, and what to do next. Everything comes from progress
// already on this device — nothing is invented.
function statRing(pct, big, small) {
  return `<div class="stat-ring"><div class="score-ring small"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="ring-track" cx="60" cy="60" r="52"/><circle class="ring-prog" cx="60" cy="60" r="52" pathLength="100" style="stroke-dashoffset:${ringOffset(pct)}"/></svg><div class="score-num"><span class="n">${big}</span><span class="muted small">${small}</span></div></div></div>`;
}

function statsSection() {
  const p = profile();
  const relevant = rankTopics(topics(), p);
  const prog = store.progress();
  const map = knowledgeMap(relevant, p, prog);
  const overall = readiness(relevant, p, prog);
  const a = store.account();
  const voiceLim = a?.limits?.voiceSec;
  const voiceLeft = a?.voiceSecLeft ?? 0;
  const voiceUsed = voiceLim ? Math.max(0, voiceLim - voiceLeft) : 0;
  const voicePct = voiceLim ? Math.round((voiceUsed * 100) / voiceLim) : 0;
  const voiceBig = voiceLim ? String(Math.round(voiceUsed / 60)) : '–';
  const voiceSmall = voiceLim ? `of ${Math.round(voiceLim / 60)} min voice` : 'sign in';
  const activity = store.activity();
  const tk = todayKey();
  const todayGraded = activity[tk]?.graded || 0;
  const dueToday = dueCards(topics(), p, prog, Date.now(), 999).length;
  const todayPct = dueToday ? Math.min(100, Math.round((todayGraded * 100) / dueToday)) : (todayGraded ? 100 : 0);
  const streak = streakDays(activity, tk);
  const days = lastNDays(activity, 14, tk);
  const maxDay = Math.max(1, ...days.map(d => d.graded));
  const weakest = map.topics.filter(t => t.total > 0 && t.pct < 100).sort((x, y) => x.pct - y.pct).slice(0, 3);
  const next = weakest[0];
  const anyActivity = days.some(d => d.graded > 0);
  return `<div class="stack loose">
    <div class="head"><h2>Where you stand</h2>
      <p class="muted">Readiness, practice and voice, from your own progress on this device.</p></div>
    <section class="rings" aria-label="Rings">
      ${statRing(overall.pct, `${overall.pct}%`, 'ready')}
      ${statRing(voicePct, voiceBig, voiceSmall)}
      ${statRing(todayPct, `${todayGraded}`, 'practised today')}
    </section>
    <section class="card stacked">
      <div class="card-head"><span>Practice streak</span><span>${streak} day${streak === 1 ? '' : 's'}</span></div>
      <p class="muted">${streak ? `You have practiced ${streak} day${streak === 1 ? '' : 's'} in a row. Keep it alive with one card today.` : 'No streak yet — grade one card and the streak starts.'}</p>
      <div class="streak-dots">${days.map(d => `<span class="${d.graded ? 'on' : ''}" title="${d.label} ${d.key}: ${d.graded} card${d.graded === 1 ? '' : 's'}"></span>`).join('')}</div>
      <div class="trend" aria-label="Cards practiced, last 14 days">${days.map(d => `<span class="tb"><i style="height:${Math.max(0, Math.round((d.graded / maxDay) * 100))}%"></i><em>${d.label.slice(0, 1)}</em></span>`).join('')}</div>
      ${anyActivity ? `<p class="muted small">Cards practiced per day, last 14 days.</p>` : `<p class="muted small">Nothing logged yet — your history starts the first day you grade a card.</p>`}
    </section>
    <section class="card stacked">
      <div class="card-head"><span>What to do next</span></div>
      ${next
        ? `<p class="muted">Your weakest spot right now is <b>${esc(next.name)}</b> — ${next.known} of ${next.total} cards known.</p><div class="row"><button class="btn primary" data-act="learn" data-id="${next.id}">Open the ${esc(next.name)} lesson</button><button class="btn" data-act="deck" data-id="${next.id}">Practice its cards</button></div>`
        : `<p class="muted">Everything you have started is solid. Pick any topic below, or practise a few cards.</p><div class="row"><button class="btn primary" data-act="deck" data-id="">Practice what's due</button></div>`}
    </section>
    <section>
      <div class="sec-head"><h3>Per-topic readiness</h3>${map.topics.length > 6 ? `<button class="link quiet small" data-act="toggletopics">${S.allTopics ? 'Show fewer' : `All ${map.topics.length} topics`}</button>` : ''}</div>
      <div class="rows">${(S.allTopics ? map.topics : map.topics.slice(0, 6)).map(t => `<button class="rowi" data-act="learn" data-id="${t.id}">
        <span class="main"><span class="t">${esc(t.name)}</span><span class="d">${t.state === 'strong' ? 'Solid' : t.state === 'ok' ? 'Getting there' : t.state === 'weak' ? 'Shaky' : 'Not started'} · ${t.known}/${t.total} cards</span></span>
        <span class="pct"><span>${t.pct}%</span><span class="bar"><i style="width:${t.pct}%"></i></span></span></button>`).join('')}</div>
    </section>
  </div>`;
}

function plansView() {
  const a = store.account();
  const o = offer();
  const isPro = a?.plan === 'pro';
  const dis = S.buyBusy ? 'disabled' : '';
  const manage = window.PP_PLATFORM === 'android' ? 'Google Play' : 'Apple ID';
  const { credits, left } = liveState();
  const yes = '<span class="yes" aria-label="Included">' + ic('check') + '</span>';
  const no = '<span class="no" aria-label="Not included">–</span>';
  const rows = [
    ['Topics in the order that matters for your role', yes, yes, '–'],
    ['Lessons', `First ${FREE_TOPICS} topics`, 'Every topic', '–'],
    ['Flashcards', `${FREE_CARDS} per technology, shuffled`, 'All, in workflow order', '–'],
    ['Terminology, troubleshooting, real scenarios', no, yes, '–'],
    ['Animated diagrams for every topic', no, yes, '–'],
    ['AI messages about your prep', `${o.freeMsgs} to try`, 'Unlimited', '–'],
    ['Voice practice', `${o.freeVoice} min to try`, `In your Live AI sessions`, `${o.liveMin} min, continuous`],
    ['Live AI voice interviews', no, `${o.proLive} min a month, only talk time counts`, `${o.liveMin} min in one go, clock runs once started`],
    ['Spoken practice test with a verdict', no, yes, yes],
    ...(S.liveInterviewIos ? [['Talking points during your real interview', no, yes, yes]] : []),
    ['Custom subjects', no, 'Up to 5', '–'],
  ];
  const liveBtn = left >= 20 ? '<button class="btn invert block lg" data-act="livesetup">Rejoin your session</button>'
    : credits ? `<button class="btn invert block lg" data-act="livesetup">Start a session (${credits} ready)</button>`
    : `<button class="btn invert block lg" data-act="buylive" ${dis}>${S.buyBusy === 'live' ? `Opening the ${storeName()}…` : `Buy one session, ${esc(o.livePrice)}`}</button><p class="muted small live-fixed-note">One fixed 60-minute session: the clock starts when you begin and keeps running if you step away. Minutes left when it ends are not returned.</p>`;
  return `<div class="stack loose pricing">
    <div class="row between" style="margin-bottom:-14px"><span></span><button class="iconbtn plain" data-act="pickfree" aria-label="Close">${ic('x')}</button></div>
    <div class="head">
      <h1>Pricing</h1>
      <p class="lede" style="margin-top:10px">Study for free. Pay monthly for AI to practise with, or by the hour for the day it counts.</p>
    </div>

    <div class="tiers">
      <section class="tier">
        <div class="tier-name">Free</div>
        <div class="price">$0</div>
        <p class="muted small">Your plan, your first ${FREE_TOPICS} topics, and a taste of AI.</p>
        <button class="btn block" data-act="pickfree" ${isPro ? 'hidden' : ''}>Continue on Free</button>
      </section>
      <section class="tier">
        <div class="tier-name">Pro</div>
        <div class="price">${esc(o.proAmount)}<span>/ ${esc(o.proPer)}</span></div>
        <p class="muted small">Every topic, every card and diagram, and ${o.proLive} Live AI minutes a month, counted only while you talk.${o.perDay ? ` ${esc(o.perDay)}.` : ''}</p>
        ${isPro ? '<button class="btn block" disabled>Your plan</button>' : `<button class="btn primary block" data-act="buysub" ${dis}>${S.buyBusy === 'pro' ? `Opening the ${storeName()}…` : 'Try Pro free for 3 days'}</button><p class="muted small trial-terms">3 days free, then ${esc(offer().proPrice)}. Cancel anytime in your ${window.PP_PLATFORM === 'android' ? 'Google Play' : 'Apple ID'} subscriptions at least 24 hours before the trial ends and you won't be charged. Free trial for new subscribers only.</p>`}
      </section>
      <section class="tier card live-hero">
        <div class="tier-name">Live AI <span class="tier-flag">One-time</span></div>
        <div class="price">${esc(o.livePrice)}<span>/ session</span></div>
        <p class="small">${o.liveMin} minutes in one go: a spoken practice test${S.liveInterviewIos ? ', or talking points on screen during your real interview' : ', or an open conversation'}.</p>
        ${liveBtn}
      </section>
    </div>

    <section>
      <div class="sec-head"><h3>What each one includes</h3></div>
      <div class="compare" role="table" aria-label="What each option includes">
        <div class="crow chead" role="row"><span role="columnheader"></span><span role="columnheader">Free</span><span role="columnheader">Pro</span><span role="columnheader">Live AI</span></div>
        ${rows.map(([f, a1, a2, a3]) => `<div class="crow" role="row"><span role="rowheader">${f}</span><span role="cell">${a1}</span><span role="cell">${a2}</span><span role="cell">${a3}</span></div>`).join('')}
      </div>
      <p class="muted small" style="margin-top:10px">A Live AI session is billed separately and works on Free or Pro. It does not use Pro's monthly minutes.</p>
    </section>

    ${S.liveInterviewIos ? `<section class="stack">
      <div class="sec-head"><h3>Live AI in your interview</h3></div>
      <p>Open a session before the call and leave this device where it can hear your interviewer. When a question is asked, three to five talking points appear on screen within seconds, built from your role and background. It never speaks, and nothing is stored.</p>
      <p class="muted small">Check that transcribing the call is allowed by the company and where you live; some places require everyone on a call to agree.</p>
    </section>` : ''}

    <div class="faq">
      <details><summary>What counts as a message?</summary><p>Each question you send AI is one message. Writing a custom card set uses five. Voice is counted in minutes, only while a session is open.</p></details>
      <details><summary>What if my connection drops during a Live AI session?</summary><p>Rejoin within the hour and you pick up the same session with the time that is left. You are not charged again.</p></details>
      <details><summary>Can I use Live AI for a practice test first and the interview later?</summary><p>Each session is one block of time. Buy two if you want one for practice and one for the day.</p></details>
      <details><summary>What can I ask AI?</summary><p>Anything that gets you ready for the interview in your technologies: explain a concept, quiz you, grade your answer, walk through an error or a short piece of code. It will not build apps, write essays or do take-home tasks. Pro messages are unlimited for normal use, with a daily fair-use limit of 150.</p></details>
      <details><summary>How do I cancel Pro?</summary><p>In your ${manage} subscription settings, at any time. You keep Pro until the end of the period you paid for.</p></details>
      <details><summary>What happens to my progress on Free?</summary><p>Nothing changes. Your plan, cards and progress stay on this device and stay yours.</p></details>
    </div>
    <p class="legal">Pro costs ${esc(o.proPrice)} and renews automatically until you cancel in your ${manage} subscription settings, at least 24 hours before the renewal date. A Live AI session is a one-time purchase of ${esc(o.livePrice)}. Payment is charged to your ${storeName()} account when you confirm the purchase.
      <a class="link quiet" href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/" target="_blank" rel="noopener">Terms of Use</a>, <a class="link quiet" href="privacy.html" target="_blank" rel="noopener">Privacy Policy</a>, <a class="link quiet" href="support.html" target="_blank" rel="noopener">Support</a>${native() ? ', <button class="link quiet" data-act="restore">Restore purchases</button>' : ''}</p>
  </div>`;
}

function topRight() {
  const a = store.account();
  if (S.login && !signedIn()) return '';
  if (!signedIn() && !S.login) return `<div class="row" style="gap:8px"><button class="btn sm quiet" data-act="login">Log in</button>${profile() && S.guest ? '' : '<button class="btn sm primary" data-act="startonboard">Get started</button>'}</div>`;
  if (!profile() || S.showPlans) return '';
  if (a?.unlimited) return '<span class="tag">Admin</span>';
  if (a?.plan === 'pro') return '<button class="tag pro" style="border:0;cursor:pointer" data-act="plans">Pro</button>';
  if (signedIn() && !a) return '';
  return '<button class="link quiet small" data-act="plans">Pricing</button>';
}

function scrollEnd() { scrollToY(inApp() ? document.body.scrollHeight : document.documentElement.scrollHeight); }

// The plans-screen diagram plays itself: it steps through the stages on its
// own so the "draws themselves, step by step" claim is visibly true, then
// rests on the full diagram. Any tap on the player stops it.
let dgTimer = null;
function stopDgAutoplay() { if (dgTimer) { clearTimeout(dgTimer); dgTimer = null; } }
function startDgAutoplay() {
  stopDgAutoplay();
  const fig = document.querySelector('[data-autoplay]');
  if (!fig) return;
  const id = fig.dataset.dg;
  const n = diagramFor(id)?.steps.length || 0;
  if (!n) return;
  S.dgStages[id] = null;
  let step = -1;
  const tick = () => {
    step++;
    if (step >= n) { S.dgStages[id] = null; render(); return; }
    S.dgStages[id] = step;
    render();
    dgTimer = setTimeout(tick, 1500);
  };
  dgTimer = setTimeout(tick, 1200);
}

// After a render, count the [data-countup] numbers up to their final value
// (they are rendered at the final value, so nothing breaks if this never runs).
// Only on entering a view: background re-renders (account, health check)
// must not replay the count-up or the map stagger from zero.
function animateIn(changed) {
  if (!changed) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('[data-countup]').forEach(el => {
    const target = Number(el.dataset.countup);
    if (!target) return;
    const t0 = performance.now(), dur = 1200;
    const tick = now => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 2)));
      if (k < 1) requestAnimationFrame(tick);
    };
    el.textContent = '0';
    requestAnimationFrame(tick);
  });
}

function render() {
  const p = profile();
  if (S.view === 'stats') S.view = 'settings'; // Stats now lives inside Profile.
  // Signed out: the landing page on every fresh open (S.guest lets someone who just built a plan
  // try it without an account, for this visit only). Admins never see pricing.
  if (isAdmin()) S.showPlans = false;
  const out = !signedIn() && !S.guest;
  const key = S.login && !signedIn() ? 'login'
    : S.showPlans ? 'plans'
    : !p ? (S.onboard ? 'onboard' : 'landing')
    : out ? 'landing'
    : S.view === 'deck' && !S.deck ? 'home' : S.view;
  const changed = key !== S.lastView;
  S.lastView = key;
  const input = document.getElementById('chatInput');
  const keep = input && key === 'chat' ? { value: input.value, focus: document.activeElement === input } : null;
  document.querySelectorAll('nav [data-nav]').forEach(b => b.setAttribute('aria-current', String(b.dataset.nav === (S.view === 'learn' ? 'home' : S.view))));
  document.querySelector('nav').hidden = !p || S.showPlans || key === 'landing' || key === 'login';
  syncDrawer(key);
  document.getElementById('topRight').innerHTML = topRight();
  // The home map assembles (tiles stagger in) only when the user arrives at
  // home, not on every background re-render.
  S._stagger = changed && key === 'home';
  const html = key === 'plans' ? plansView()
    : key === 'login' ? loginView()
    : key === 'landing' ? landingView()
    : key === 'onboard' ? onboardingView(null)
    : key === 'learn' ? learnView()
    : key === 'deck' ? deckView()
    : key === 'chat' ? chatView()
    : key === 'custom' ? customView()
    : key === 'focus' ? jobFocusView()
    : key === 'lab' ? labView()
    : key === 'settings' ? settingsView()
    : homeView();
  app.innerHTML = `<div class="${changed ? 'view' : ''}">${html}</div>`;
  S._stagger = false;
  if (keep) { const i = document.getElementById('chatInput'); if (i) { i.value = keep.value; if (keep.focus) i.focus(); } }
  mountGoogleButton();
  filterRoles();
  if (key === 'chat') { paintVoice(); if (!changed || store.chat().length) scrollEnd(); else scrollToY(0); }
  else if (changed || key === 'learn' || key === 'deck') scrollToY(0);
  // Ask once, after a Google sign-in, what extra guides the user wants. Waits until
  // the plans screen is closed and no voice call is live, so it never covers either.
  if (S.suggestPending && !S.showPlans && !S.live && profile()) {
    S.suggestPending = false;
    store.setSuggestAsked(true);
    suggestSheet();
  }
  // Native app: keep the icon badge and the daily reminder in step with the plan.
  if (native() && key === 'home' && profile()) syncNativeHome();
  if (key === 'chat' && profile()) loadFresh();
  if (key === 'landing' && !S.demo) loadDemo();
  if (key === 'landing') { storyLast = -1; requestAnimationFrame(paintStory); if (changed || !featTimer) startFeat(); } else stopFeat();
  // The plans-screen diagram plays itself when the screen opens; anywhere
  // else the player stops so timers never outlive their screen.
  if (key === 'plans' && changed) startDgAutoplay();
  else if (key !== 'plans') stopDgAutoplay();
  animateIn(changed);
}

/* ---------- purchases ---------- */
function needSignIn() {
  S.showPlans = false; S.view = 'settings'; render();
  toast('Sign in first. It takes a few seconds, then pick your plan.');
}
function storeSheet() {
  sheet(`<h2>Upgrades live in the iPhone app</h2>
    <p class="muted">Pro and Live AI sessions are bought through the App Store. Sign in there with this same account and everything unlocks here too, on any device.</p>
    <button class="btn primary block" data-act="closesheet">Got it</button>`);
}
let buyTimer;
function buy(kind) { // 'pro' | 'live' | 'restore'
  if (!store.session()) return needSignIn(); // beta-code sessions have no account to attach a purchase to
  if (!native()) return storeSheet();
  const acc = store.account();
  if (!acc?.key) return oops('Still loading your account. Try again in a moment.');
  S.buying = { kind, credits: acc.sessionCredits || 0 };
  S.buyBusy = kind; render();
  // Older app builds don't report a cancelled purchase sheet, so never leave the buttons locked.
  clearTimeout(buyTimer);
  buyTimer = setTimeout(() => { S.buyBusy = false; render(); }, 8000);
  if (kind === 'pro') nativePurchase(acc.key); else if (kind === 'live') nativeBuyLive(acc.key); else nativeRestore(acc.key);
}
function buyDone() { clearTimeout(buyTimer); const b = S.buying; S.buying = null; S.buyBusy = false; return b; }
// The store confirms a purchase before our server has heard about it; check again a few times.
function pollPurchase(before, tries = [3000, 8000, 20000]) {
  if (!tries.length) return;
  setTimeout(async () => {
    try { await ai.post('/api/billing/refresh', {}); } catch { /* try again below */ }
    const a = store.account();
    if ((a?.sessionCredits || 0) > before.credits) { S.showPlans = false; render(); return toast('Live AI session added. Start it from the AI tab.'); }
    if (before.kind === 'pro' && a?.plan === 'pro') { S.showPlans = false; render(); return toast('You\'re on Pro. Thank you!'); }
    pollPurchase(before, tries.slice(1));
  }, tries[0]);
}
function onPurchased(acc) {
  const b = buyDone();
  S.paywall = false;
  if (acc?.plan === 'pro') { S.showPlans = false; toast(b?.kind === 'restore' ? 'Pro restored.' : 'You\'re on Pro. Thank you!'); }
  else if (b?.kind === 'restore') oops('No active subscription found for this account.');
  else if (b?.kind === 'live') { toast('Payment received. Your Live AI session will unlock in a moment.'); pollPurchase(b); }
  else { toast('Payment received. Pro will unlock in a moment.'); pollPurchase(b); }
  render();
}

/* ---------- actions ---------- */
// ids = topics the user explicitly chose (may be outside their role); null = everything relevant.
const FIELD_KINDS = { terms: 'Terminology', trouble: 'Troubleshooting', scenarios: 'Real scenario' };
// Field cards: the words, the breakages and the real situations of each technology. Pro only.
function fieldCards(kind, topicId) {
  const p = profile();
  const list = topicId ? [topicById(topicId)].filter(Boolean) : rankTopics(topics(), p);
  return list.flatMap(t => (t.field?.[kind] || []).map((c, i) => ({ id: `${t.id}-f-${kind}-${i}`, topic: t.id, q: c.q, a: c.a, l: 2, kind })));
}
function startFieldDeck(kind, topicId) {
  if (!hasPro()) { S.showPlans = true; return render(); }
  const cards = fieldCards(kind, topicId);
  if (!cards.length) return oops('Field cards for these topics are on their way.');
  S.deck = { cards: topicId ? cards : shuffle(cards).slice(0, 20), results: [], free: false, total: cards.length };
  S.di = 0; S.reveal = false; S.view = 'deck'; render();
}
function fieldSection(relevant) {
  const has = k => relevant.some(t => t.field?.[k]?.length);
  if (!['terms', 'trouble', 'scenarios'].some(has)) return '';
  const sample = relevant.flatMap(t => (t.field?.trouble || []).slice(0, 1).map(c => ({ t, c })))[0];
  const tiles = [['terms', 'Terminology', 'The words you will hear, in workflow order'], ['trouble', 'Troubleshooting', 'Real errors, their cause and the fix'], ['scenarios', 'Real scenarios', 'What interviewers ask about actual work']];
  return `<section class="stack">
    <div class="sec-head"><h3>From the field</h3>${hasPro() ? '' : '<span class="tag">Pro</span>'}</div>
    <div class="l-grid">${tiles.filter(([k]) => has(k)).map(([k, n, d]) => `<button class="l-tile field-tile" data-act="fielddeck" data-k="${k}">${ic(hasPro() ? 'right' : 'lock')}<b>${n}</b><span>${d}</span><span class="muted small">${fieldCards(k).length} cards</span></button>`).join('')}</div>
    ${!hasPro() && sample ? `<div class="teaser" style="min-height:120px"><div class="teaser-blur" aria-hidden="true" inert><p><b>${esc(sample.c.q)}</b></p><p class="muted">${esc(sample.c.a)}</p></div><div class="teaser-over"><b>${ic('lock')}${esc(sample.c.q)}</b><span class="muted small">Troubleshooting and real scenarios for ${esc(sample.t.name)} and every other topic come with Pro.</span><button class="btn primary" data-act="plans">See pricing</button></div></div>` : ''}
  </section>`;
}

/* Two ways through the cards. Steady: the plan's order, due cards first. Swipe: a shuffled mix across
   every skill in the user's profile, one quick swipe per card. The choice is remembered per device. */
const lsGet = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage blocked */ } };
// Text size: scales every rem-sized text (lessons, cards, answers, code) from the root.
const textSize = () => { const v = lsGet('pp.textSize', 'm'); return ['s', 'm', 'l'].includes(v) ? v : 'm'; };
function setTextSize(v) { lsSet('pp.textSize', v); document.documentElement.dataset.ts = v; }
document.documentElement.dataset.ts = textSize();
// Inside the iPhone / Android app: behave like an app, not a web page. Double-tap never zooms.
if (window.PP_PLATFORM) {
  document.documentElement.classList.add('in-app');
  const vp = document.querySelector('meta[name=viewport]');
  if (vp) vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover');
}
const deckMode = () => (lsGet('pp.deckMode', 'steady') === 'swipe' ? 'swipe' : 'steady');
const setDeckMode = m => lsSet('pp.deckMode', m);
// Spread topics out so a swipe round rarely shows two cards from the same skill in a row.
function mixTopics(cards) {
  // Each topic keeps its own order (cards are written easy to hard); only the topics are interleaved.
  const by = new Map(); cards.forEach(c => { if (!by.has(c.topic)) by.set(c.topic, []); by.get(c.topic).push(c); });
  const lanes = shuffle([...by.values()]), out = [];
  while (lanes.some(l => l.length)) for (const l of lanes) if (l.length) out.push(l.shift());
  return out;
}

// Floating cards window (desktop browsers): keeps cards on top while you work in other apps.
// "Float cards automatically": browsers need a click to open it, so the first click of each visit does.
document.addEventListener('pointerdown', () => {
  if (S.pipAutoDone || lsGet('pp.pipAuto', 'on') !== 'on' || !signedIn() || !profile() || pipOpen() || !pipSupport() || native()) return;
  S.pipAutoDone = true;
  popOut();
}, true);
const popBtn = () => (pipSupport() ? `<button class="iconbtn plain pop-btn" data-act="popout" aria-label="Float these cards over other apps" title="Float over other apps">${ic('pip')}</button>` : '');
async function popOut() {
  let cards;
  if (S.view === 'deck' && S.deck && S.di < S.deck.cards.length) cards = S.deck.cards.slice(S.di);
  else {
    const pro = hasPro(), p = profile();
    let list = dueCards(topics(), p, store.progress(), Date.now(), 999);
    if (!pro) { const allowed = freeCardIds(); list = list.filter(c => allowed.has(c.id)); }
    cards = interviewRound(list, { weightOf: id => { const t = topicById(id); return t ? topicWeight(t, p) : 0; }, mix: true, limit: pro ? 20 : FREE_CARDS });
  }
  cards = cards.map(c => ({ ...c, topicName: c.topicName || topicName(c.topic) }));
  if (!cards.length) return toast('No cards due right now.');
  try {
    const ok = await popOutCards({ cards, onGrade: (c, ok) => {
      if (!c.jf) { const prog = store.progress(); prog[c.id] = review(prog[c.id], ok); store.setProgress(prog); }
      store.setActivity(recordActivity(store.activity(), todayKey(), ok));
    }, onDone: () => render() });
    if (!ok) toast('Floating cards work in Chrome, Edge and Safari on a computer.');
    else if (S.view === 'deck') { S.view = 'home'; render(); }
  } catch { toast('Could not open the floating window. Try again.'); }
}

function startDeck(ids, opts = {}) {
  if (!ids) S.lsLabel = '';
  const mode = opts.mode || deckMode();
  const list = ids ? topics().filter(t => ids.includes(t.id)) : topics();
  const pro = hasPro();
  // Free: the user's fixed sample of 10 cards per technology, shuffled. Pro: everything, in workflow order, 20 a round.
  let cards = dueCards(list, profile(), store.progress(), Date.now(), 999, { relevantOnly: !ids });
  if (!pro) {
    const allowed = freeCardIds();
    cards = shuffle(cards.filter(c => topicById(c.topic)?.custom || topicById(c.topic)?.private || allowed.has(c.id)));
  }
  // Easy to hard, interview topics first. Swipe mixes the core topics; steady keeps the plan's topic order.
  const p = profile();
  // Searched or picked topics: the role's own weight where it has one, so core topics lead and
  // nice-to-know ones (e.g. build tools for a Java search) only fill in.
  const weightOf = id => { const t = topicById(id); if (!t) return 0; const w = topicWeight(t, p); return ids ? (w || 2) : w; };
  cards = interviewRound(cards, { weightOf, mix: mode === 'swipe', limit: pro ? 20 : FREE_CARDS });
  S.swStreak = 0;
  S.deck = { cards, results: [], free: !pro, total: list.reduce((n, t) => n + t.qa.length, 0), mode, ids };
  S.di = 0; S.reveal = false; S.view = 'deck'; render();
}

// Job focus cards as a swipe round: every skill mixed together. Not part of the spaced-repetition plan.
function startSkillDeck(i) {
  const t = S.jf?.result?.stack[i];
  if (!t?.cards) return;
  const cards = t.cards.map((c, k) => ({ id: `jf-${i}-${k}`, topic: t.name, topicName: t.name, q: c.q, a: c.a, why: c.why, ex: c.ex, trap: c.trap, l: 0, jf: true }));
  S.deck = { cards, results: [], free: false, total: cards.length, mode: 'swipe', jf: true };
  S.di = 0; S.reveal = false; S.view = 'deck'; render();
}
function startJobDeck() {
  const r = S.jf?.result;
  if (!r) return;
  const cards = r.stack.flatMap((t, i) => (t.cards || []).map((c, k) => ({ id: `jf-${i}-${k}`, topic: t.name, topicName: t.name, q: c.q, a: c.a, why: c.why, ex: c.ex, trap: c.trap, l: 0, jf: true })));
  if (!cards.length) return oops('The cards are still being written. Give it a few seconds.');
  S.deck = { cards: mixTopics(cards), results: [], free: false, total: cards.length, mode: 'swipe', jf: true };
  S.di = 0; S.reveal = false; S.view = 'deck'; render();
}

function startRoleDeck(id) {
  const p = profile();
  const role = roleById(id === 'other' ? p.baseRoleId : id);
  const list = rankTopics(topics().filter(t => role?.topics?.[t.id]), { ...p, roleIds: [id], roleId: id, extras: [] });
  startDeck(list.map(t => t.id));
}

async function openTopic(id) {
  S.topic = id; S.ci = 0; S.view = 'learn';
  const firstReal = t => (profile()?.level === 'senior' ? Math.max(0, t.concepts.findIndex(c => !c.basic)) : 0);
  if (topicById(id)) S.ci = firstReal(topicById(id));
  render();
  if (!topicById(id)) {
    try { await ensureTopics([id]); } catch { oops('Could not download this topic. Check your connection.'); }
    render();
  }
}

// Grade a flashcard: stamp the verdict on the card so the user sees it land,
// then deal the next one. Extracted so the keyboard can grade too.
function gradeCard(ok, swiped = false) {
  if (S.grading || !S.deck || S.di >= S.deck.cards.length) return;
  const q = S.deck.cards[S.di], prog = store.progress();
  if (!q.jf) { prog[q.id] = review(prog[q.id], ok); store.setProgress(prog); }
  // Practice history for the stats view: one count per day, starting today.
  store.setActivity(recordActivity(store.activity(), todayKey(), ok));
  S.grading = true;
  const flash = document.getElementById('flash');
  if (swiped) {
    // The swipe itself was the verdict: no stamp, straight to the next card.
    setTimeout(() => { S.grading = false; S.deck.results.push(ok); S.di++; S.reveal = false;
      if (S.di >= S.deck.cards.length && native() && !store.notifAsked()) { store.setNotifAsked(true); promptNotifications(); }
      render(); }, 230);
    return;
  }
  if (flash) {
    flash.insertAdjacentHTML('beforeend', `<div class="verdict ${ok ? 'ok' : 'miss'}" aria-hidden="true">
      <svg viewBox="0 0 64 64"><circle class="v-ring dg-draw" cx="32" cy="32" r="28" pathLength="100" style="animation-duration:.6s"/>
      ${ok ? '<path class="v-mark dg-draw" d="M20 33 L28 41 L44 25" style="animation-delay:.5s;animation-duration:.35s"/>' : '<path class="v-mark dg-draw" d="M23 23 L41 41 M41 23 L23 41" style="animation-delay:.5s;animation-duration:.35s"/>'}</svg>
      <span>${ok ? 'Got it' : 'Missed it — back soon'}</span></div>`);
    // Let the stamp draw and sit for a beat, then the card leaves to the
    // side it was graded on. The verdict is the celebration — give it time.
    setTimeout(() => flash.classList.add(ok ? 'out-r' : 'out-l'), 850);
  }
  setTimeout(() => {
    S.grading = false; S.deck.results.push(ok); S.di++; S.reveal = false;
    // First finished round: a sensible moment to ask about daily reminders.
    if (S.di >= S.deck.cards.length && native() && !store.notifAsked()) { store.setNotifAsked(true); promptNotifications(); }
    render();
  }, 1100);
}



function aiFailed(err) {
  if (err.code === 'quota') { S.paywall = true; S.view = 'chat'; }
  else if (err.code === 'signin') S.view = 'chat';
  oops(err.message);
}

async function buildRoleGuide() {
  const p = profile();
  if (!signedIn()) { S.view = 'chat'; return render(); }
  // The role guide is written during onboarding, so it is not Pro-gated —
  // but it still takes one of the 5 custom-subject slots.
  if (store.customTopics().length >= CUSTOM_LIMIT) return toast(`You already have ${CUSTOM_LIMIT} custom subjects. Delete one to make room.`);
  S.busy = true; render();
  try {
    const r = await ai.generate(`${p.otherRole}: interview essentials`, summary(), 12);
    const id = 'c-role-' + Date.now().toString(36);
    const topic = { id, name: `${p.otherRole} essentials`, blurb: 'Written for your role', tag: 'ai', concepts: r.concepts, qa: r.qa, custom: true, beta: true };
    if (r.diagram) topic.diagram = r.diagram;
    saveCustomTopic(topic);
    toast('Your role guide is in your topics.');
  } catch (err) { aiFailed(err); }
  S.busy = false; render();
}

// ---------- custom subjects (Pro) ----------
// A Pro user keeps up to 5 custom subjects. Each one AI writes costs
// 5 AI messages (the same cost as before — the cap is about subjects kept,
// the messages are about AI spend). Free users keep the subjects they
// already have, but cannot write new ones.
const CUSTOM_LIMIT = 5;
const isProUser = () => { const a = store.account(); return !!a && (a.plan === 'pro' || a.unlimited); };
function customLimitReason() {
  if (!signedIn()) return 'signin';
  if (!isProUser()) return 'pro';
  if (store.customTopics().length >= CUSTOM_LIMIT) return 'cap';
  return null;
}
function saveCustomTopic(topic) {
  if (topic.diagram) registerDiagramSpec(topic.id, topic.diagram);
  store.setCustomTopics([...store.customTopics(), topic]);
  return topic;
}
async function buildCustomSubject(name) {
  name = (name || '').trim();
  if (!name) return;
  const reason = customLimitReason();
  if (reason === 'signin') { S.view = 'chat'; render(); return; }
  if (reason === 'pro') { S.view = 'custom'; render(); return toast('Custom subjects are a Pro feature.'); }
  if (reason === 'cap') return toast(`You already have ${CUSTOM_LIMIT} custom subjects. Delete one to make room.`);
  S.busy = true; render();
  try {
    const r = await ai.generate(name, summary(), 8);
    const id = 'c-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Date.now().toString(36);
    const topic = { id, name, blurb: 'Custom subject', tag: 'ai', concepts: r.concepts, qa: r.qa, custom: true, beta: true };
    if (r.diagram) topic.diagram = r.diagram;
    saveCustomTopic(topic);
    toast(`"${name}" is ready — starting the first lesson.`);
    S.busy = false;
    openTopic(id);
  } catch (err) { S.busy = false; aiFailed(err); render(); }
}

async function sendChat(text, { fromVoice = false } = {}) {
  text = text.trim();
  if (!text || S.busy) return;
  if (S.rt) {
    store.setChat([...store.chat(), { role: 'user', content: text }]);
    render();
    S.rt.sendText(text);
    return;
  }
  const msgs = [...store.chat(), { role: 'user', content: text }];
  store.setChat(msgs); S.busy = true; render();
  try {
    const reply = await ai.chat(msgs.filter(m => !isNotice(m)).slice(-12), { profileSummary: summary(), context: S.chatContext, voice: fromVoice && store.speak() });
    store.setChat([...store.chat(), { role: 'assistant', content: reply }]);
    if (store.speak()) voice.speak(reply);
  } catch (e) {
    if (e.code === 'quota') S.paywall = true;
    store.setChat([...store.chat(), { role: 'assistant', content: `⚠️ ${e.message}` }]);
  } finally { S.busy = false; render(); }
}

function cardContext(t, c) { return `${t.name} — ${c.t}\n${c.what}\n${c.ex ? 'Example:\n' + c.ex.slice(0, 1200) : ''}`; }

document.addEventListener('submit', async e => {
  e.preventDefault();
  if (e.target.id === 'profileForm') return saveProfile();
  if (e.target.id === 'learnForm') {
    const q = document.getElementById('learnSearch')?.value || '';
    const hits = lsSearch(q);
    if (q.trim() && (looksLikeQuestion(q) || !hits.length)) { S.lsQ = ''; S.view = 'chat'; render(); return sendChat(q); }
    const best = hits[0].score; // everything as good as the top match (e.g. "java" -> Core Java, JVM, Spring...)
    return lsStart(hits.filter(h => h.score >= Math.min(best, 4)).slice(0, 4).map(h => h.id), q);
  }
  if (e.target.id === 'chatForm') { const i = document.getElementById('chatInput'); const v = i.value; i.value = ''; i.style.height = ''; return sendChat(v); }
  if (e.target.id === 'codeForm') { store.setAccessCode(document.getElementById('code').value.trim()); return render(); }
  if (e.target.classList?.contains('suggest-form')) return submitSuggestion(e.target);
  if (e.target.id === 'liveSetupForm') {
    const fd = new FormData(e.target);
    const settings = {
      lengthMin: 240, // no length to pick: the session runs until it is ended, paused or out of minutes
      voice: fd.get('voice') === 'on',
      style: String(fd.get('style') || 'friendly'),
      topic: String(fd.get('topic') || ''),
      difficulty: String(fd.get('difficulty') || 'mid'),
      use: fd.get('use') === 'interview' ? 'interview' : 'talk',
    };
    store.setLiveSettings(settings);
    closeSheet();
    const { credits, left } = liveState();
    const ac = store.account();
    const proOk = isAdmin() || (ac?.plan === 'pro' && (ac.proLiveSecLeft || 0) >= 60);
    if (left < 20 && !credits && !proOk) { S.showPlans = true; return render(); }
    // A one-time session is a fixed 60-minute clock: say so before it starts.
    if (left < 20 && credits && !proOk && !confirm('Start your 60-minute Live AI session now?\n\nThe 60 minutes start counting now and keep running even if you leave. Unused minutes are not returned.')) return;
    S.view = 'chat'; render();
    return startVoice('live');
  }
  if (e.target.id === 'genForm') {
    const topic = document.getElementById('genTopic').value.trim();
    return buildCustomSubject(topic);
  }
  if (e.target.id === 'customForm') {
    const topic = document.getElementById('customTopic').value.trim();
    return buildCustomSubject(topic);
  }
});

function filterRoles() {
  const q = S.roleSearch.trim().toLowerCase();
  document.querySelectorAll('#profileForm .allroles [data-act=pickrole]').forEach(b => { b.hidden = !!q && !(b.dataset.search || '').includes(q) && b.dataset.id !== 'other'; });
  document.querySelectorAll('#profileForm .rolefam').forEach(f => { f.hidden = ![...f.querySelectorAll('[data-act=pickrole]')].some(b => !b.hidden); });
  const all = document.querySelector('#profileForm .allroles');
  if (all && q) { all.open = true; const sm = all.querySelector('summary'); if (sm) sm.textContent = 'Matching roles'; }
}

app.addEventListener('keydown', e => {
  if (e.target.id !== 'chatInput' || e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
  e.preventDefault();
  const form = document.getElementById('chatForm');
  if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});

// Flashcards by keyboard: Space reveals, arrows grade. Only in the deck,
// and never while typing or with a button focused.
app.addEventListener('keydown', e => {
  if (S.view !== 'deck' || !S.deck || S.di >= S.deck.cards.length) return;
  if (e.target?.matches?.('input, textarea, select, button')) return;
  if (S.deck.mode === 'swipe') {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); swFlip(); }
    else if (e.key === 'ArrowRight') swDecide(true, 1.4);
    else if (e.key === 'ArrowLeft') swDecide(false, -1.4);
    else if (e.key === 'ArrowUp') { e.preventDefault(); swDecide(true, 1.6, true); }
    return;
  }
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (!S.reveal) { S.reveal = true; render(); }
  } else if (e.key === 'ArrowRight' && S.reveal) gradeCard(true);
  else if (e.key === 'ArrowLeft' && S.reveal) gradeCard(false);
});

app.addEventListener('toggle', e => {
  const k = e.target.dataset?.k;
  if (!k || !S.jf?.open) return;
  e.target.open ? S.jf.open.add(k) : S.jf.open.delete(k);
}, true);
app.addEventListener('input', e => {
  if (e.target.id === 'chatInput') { e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; }
  if (e.target.id === 'expSummary') S.expSummary = e.target.value;
  if (e.target.id === 'jfText' && S.jf) S.jf.text = e.target.value;
  if (e.target.id === 'learnSearch') { S.lsQ = e.target.value; const r = document.getElementById('lsResults'); if (r) r.innerHTML = lsResultsHtml(S.lsQ); }
  if (e.target.id !== 'roleSearch') return;
  S.roleSearch = e.target.value;
  filterRoles();
});

document.addEventListener('change', e => {
  if (e.target.name !== 'use' || !e.target.closest('#liveSetupForm')) return;
  const f = e.target.closest('form'), interview = e.target.value === 'interview';
  f.querySelector('.practice-only').hidden = interview;
  f.querySelector('.interview-only').hidden = !interview;
});

app.addEventListener('change', async e => {
  if (e.target.id === 'speakToggle') { store.setSpeak(e.target.checked); if (!e.target.checked) voice.stopSpeaking(); }
  if (e.target.name === 'baseRoleId') { captureDraft(); render(); }
  if (e.target.id === 'importPack') {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const pack = JSON.parse(await f.text());
      if (!Array.isArray(pack.topics) || !pack.topics.every(t => t.id && Array.isArray(t.concepts) && Array.isArray(t.qa))) throw new Error('Not a PrepPilot pack.');
      if (pack.topics.some(t => topicMeta(t.id))) throw new Error('Pack topic ids clash with built-in topics.');
      store.setPrivatePacks([...store.privatePacks().filter(p => p.id !== pack.id), { id: pack.id || f.name, name: pack.name || f.name, topics: pack.topics }]);
      toast('Pack imported.');
      render();
    } catch (err) { oops('Import failed: ' + err.message); }
  }
});

document.addEventListener('click', async e => {
  if (e.target.id === 'sheet') return closeSheet();
  const b = e.target.closest('[data-act],[data-nav]');
  if (!b || b.disabled) return;
  if (b.dataset.nav) {
    S.draft = null;
    S.roleSearch = '';
    if (b.dataset.nav === 'deck') return startDeck(null);
    // The PrepPilot logo, for anyone not signed in, always returns to the animated landing page,
    // even mid-onboarding or while trying the plan as a guest. "Get started" leads back in.
    if (b.classList.contains('brand') && !signedIn()) {
      S.login = false; S.onboard = false; S.guest = false; S.showPlans = false; S.view = 'home';
      render(); return scrollToY(0);
    }
    S.view = b.dataset.nav; return render();
  }
  const a = b.dataset.act, id = b.dataset.id;
  if (a === 'rate') {
    const order = ['', 'strong', 'weak'];
    const cur = order.find(c => c && b.classList.contains(c)) || '';
    b.classList.remove('strong', 'weak');
    const next = order[(order.indexOf(cur) + 1) % 3];
    if (next) b.classList.add(next);
    return;
  }
  if (a === 'extra') { b.classList.toggle('on'); return; }
  if (a === 'pickrole') {
    captureDraft();
    S.draft.roleIds = S.draft.roleIds.includes(id) ? S.draft.roleIds.filter(r => r !== id) : [...S.draft.roleIds, id];
    const scroll = scrollYNow();
    render();
    scrollToY(scroll);
    return;
  }
  if (a === 'closesheet') closeSheet();
  else if (a === 'startonboard') {
    // Get started = a first-time setup. A plan left on this device by someone who never signed in is cleared.
    if (!signedIn()) { store.clearUser(); Object.assign(S, { draft: null, deck: null, jf: null, prevMap: null, pickMode: null }); }
    S.login = false; S.onboard = true; S.guest = true; render();
  }
  else if (a === 'login') { S.login = true; render(); }
  else if (a === 'loginback') { S.login = false; render(); }
  else if (a === 'feat') showFeat(Number(b.dataset.i) || 0, true);
  else if (a === 'demoreveal') { if (S.demo) { S.demo.reveal = true; render(); } }
  else if (a === 'demoshuffle') loadDemo();
  else if (a === 'demolane') loadDemo(Number(b.dataset.i));
  else if (a === 'qcreveal') { if (S.qc) { S.qc.reveal = true; render(); } }
  else if (a === 'qcnext') { S.qc = null; render(); }
  else if (a === 'pickmode') { captureDraft(); S.pickMode = b.dataset.m; render(); }
  else if (a === 'suggestroles') suggestRoles();
  else if (a === 'reloadsug') { S.adminSug = null; render(); }
  else if (a === 'fielddeck') startFieldDeck(b.dataset.k, b.dataset.id || null);
  else if (a === 'toggletopics') { S.allTopics = !S.allTopics; const y = scrollYNow(); render(); scrollToY(y); }
  else if (a === 'home') { S.view = 'home'; render(); }
  else if (a === 'learn') openTopic(id);
  else if (a === 'buildrole') buildRoleGuide();
  else if (a === 'cnext') { S.ci++; render(); }
  else if (a === 'cprev') { S.ci--; render(); }
  else if (a === 'nndismiss') { lsSet('pp.newTopics', ''); render(); }
  else if (a === 'editprofile') { S.editProfile = !S.editProfile; render(); }
  else if (a === 'textsize') { setTextSize(b.dataset.v); render(); }
  else if (a === 'prefmode') { setDeckMode(b.dataset.v); render(); }
  else if (a === 'newdeck') startNewDeck();
  else if (a === 'jfbrief') buildBrief();
  else if (a === 'jfbriefoff') { S.liveBrief = null; liveSetupSheet(); }
  else if (a === 'jfbriefswipe') startBriefDeck();
  else if (a === 'jfmock') { S.liveBrief = { jd: S.jf?.result?.text || S.jf?.text || '', resume: lsGet('pp.resume', '') }; liveSetupSheet(); }
  else if (a === 'jfbriefnew') { if (S.jf?.result) { delete S.jf.result.brief; jfSave(S.jf.result); } render(); }
  else if (a === 'tfscope') { S.tfScope = b.dataset.v; render(); document.getElementById('tfSnap')?.scrollTo({ top: 0 }); }
  else if (a === 'newchat') { store.newChat(); S.chatContext = ''; S.drawer = false; render(); document.getElementById('chatInput')?.focus(); }
  else if (a === 'drawer') { setDrawer(!S.drawer); }
  else if (a === 'ndall') { S.ndAll = !S.ndAll; syncDrawer(S.lastView); }
  else if (a === 'ndchat') { store.setChatCur(id); setDrawer(false); S.view = 'chat'; S.showPlans = false; render(); }
  else if (a === 'ndnewchat') { store.newChat(); S.chatContext = ''; setDrawer(false); S.view = 'chat'; S.showPlans = false; render(); setTimeout(() => document.getElementById('chatInput')?.focus(), 50); }
  else if (a === 'ndgo') {
    const v = b.dataset.v; setDrawer(false); S.showPlans = false;
    if (v === 'search') { S.view = 'home'; render(); scrollToY(0); setTimeout(() => document.getElementById('learnSearch')?.focus(), 80); }
    else if (v === 'deck') startDeck(null);
    else if (v === 'jobfocus') { S.view = 'focus'; render(); }
    else if (v === 'live') { S.view = 'chat'; render(); liveSetupSheet(); }
    else if (v === 'plans') { S.showPlans = true; render(); }
    else { S.view = v; render(); }
    scrollToY(0);
  }
  else if (a === 'speak') { store.setSpeak(!store.speak()); if (!store.speak()) voice.stopSpeaking(); render(); }
  else if (a === 'openchat') { store.setChatCur(id); S.drawer = false; render(); }
  else if (a === 'delchat') { store.deleteChat(id); render(); }
  else if (a === 'askai') { S.view = 'chat'; render(); sendChat(b.dataset.q || ''); }
  else if (a === 'deck') { S.lsLabel = d0label(id); startDeck(id ? id.split(',') : null); }
  else if (a === 'lsgo') { const t = getManifest().packs.flatMap(pk => pk.topics).find(x => x.id === id); lsStart([id], t?.name); }
  else if (a === 'deckmode') {
    const m = b.dataset.m, tg = b.closest('.mode-tg');
    if ((m === 'swipe') === !!tg?.classList.contains('is-swipe')) return;
    tg?.classList.toggle('is-swipe', m === 'swipe');
    tg?.querySelectorAll('button').forEach(x => x.setAttribute('aria-checked', String(x.dataset.m === m)));
    setDeckMode(m);
    setTimeout(() => startDeck(S.deck?.ids || null, { mode: m }), 220); // let the thumb glide first
  }
  else if (a === 'swipedeck') { setDeckMode('swipe'); lsSet('pp.swipeTried', '1'); startDeck(null, { mode: 'swipe' }); }
  else if (a === 'swipeintro') { lsSet('pp.swipeIntro', '1'); document.querySelector('.sw-intro')?.remove(); }
  else if (a === 'swgo') swDecide(b.dataset.ok !== '0', b.dataset.ok === '0' ? -1.4 : 1.4, b.dataset.ok === '2');
  else if (a === 'swmatchok') { S.swMatch = false; document.querySelector('.sw-match')?.remove(); if (S.swEndAfterMatch) { S.swEndAfterMatch = false; render(); } }
  else if (a === 'swflip') swFlip();
  else if (a === 'swmore') { const c = document.getElementById('swTop'); c?.classList.toggle('more'); b.querySelector('span').textContent = c?.classList.contains('more') ? 'Back to the answer' : 'Why · Example · Trap'; }
  else if (a === 'swipenah') { lsSet('pp.swipeTried', '1'); render(); }
  else if (a === 'jfswipe') startJobDeck();
  else if (a === 'roledeck') startRoleDeck(id);
  else if (a === 'reveal') { S.reveal = true; render(); }
  else if (a === 'grade') gradeCard(b.dataset.ok === '1');
  else if (a === 'popout') popOut();
  else if (a === 'pipauto') { lsSet('pp.pipAuto', b.dataset.v); if (b.dataset.v === 'on') { S.pipAutoDone = true; popOut(); } render(); }
  else if (a === 'dgprev') { stopDgAutoplay(); S.dgStages[id] = prevStage(S.dgStages[id] ?? null); refreshDgSheet(id); render(); }
  else if (a === 'dgnext') { stopDgAutoplay(); S.dgStages[id] = nextStage(S.dgStages[id] ?? null, (diagramFor(id)?.steps.length || 1)); refreshDgSheet(id); render(); }
  else if (a === 'dgreplay') { stopDgAutoplay(); S.dgStages[id] = null; refreshDgSheet(id); render(); }
  else if (a === 'dgsheet') { sheet(dgSheetHtml(id)); S.sheetDg = id; }
  else if (a === 'askcard') {
    const t = topicById(S.topic), c = t.concepts[S.ci];
    S.chatContext = cardContext(t, c); S.view = 'chat'; render();
  }
  else if (a === 'askq') {
    const q = S.deck.cards[S.di];
    S.chatContext = `Interview question: ${q.q}\nModel answer: ${q.a}`;
    S.view = 'chat'; render();
    if (signedIn()) sendChat('Go deeper on this question: what follow-ups would an interviewer ask, and what would a strong answer add?');
  }
  else if (a === 'quick') sendChat(b.dataset.q);
  else if (a === 'rtstart') startVoice(b.dataset.mode);
  else if (a === 'plans') { S.showPlans = true; render(); }
  else if (a === 'openlab') { S.view = 'lab'; render(); scrollToY(0); }
  else if (a === 'jobfocus') { S.view = 'focus'; render(); }
  else if (a === 'jfgo') jobFocusGo();
  else if (a === 'jfpick') { S.jf.sel = Number(b.dataset.i) || 0; render(); }
  else if (a === 'jfretry') jobFocusCards(Number(b.dataset.i) || 0);
  else if (a === 'tipok') { tipSeen(b.dataset.id); render(); }
  else if (a === 'tipgo') { const t = TIPS.find(x => x.id === b.dataset.id); tipSeen(t.id); if (t.act === 'popout') popOut(); else if (t.act === 'deck') startDeck(null); else if (t.act === 'jobfocus') { S.view = 'focus'; render(); } else { S.view = t.act; render(); } scrollToY(0); }
  else if (a === 'labfmt') { S.lab.fmt = b.dataset.id; S.lab.q = null; render(); scrollToY(0); }
  else if (a === 'labq') { S.lab.q = b.dataset.id; render(); scrollToY(0); }
  else if (a === 'labback') { S.lab.q = null; render(); scrollToY(0); }
  else if (a === 'labhome') { S.lab.fmt = null; S.lab.q = null; render(); scrollToY(0); }
  else if (a === 'labshow' || a === 'labhide') { const st = S.lab.open[S.lab.q]; st.mine = document.getElementById('labMine')?.value ?? st.mine; st.show = a === 'labshow'; render(); }
  else if (a === 'labgrade') labGrade();
  else if (a === 'lablive') { const f = S.lab.data[S.lab.fmt], q = f.questions.find(x => x.id === S.lab.q); S.chatContext = `Interview question (${f.name}): ${q.title}\nAsk me this question as the interviewer, listen to my full answer, then probe with follow-ups like: ${q.answer.followups.join(' / ')}`; S.view = 'chat'; render(); liveSetupSheet(); }
  else if (a === 'jfmode') { S.jf.mode = b.dataset.v; render(); }
  else if (a === 'jfrolepick') { S.jf.mode = 'role'; S.jf.roleText = b.dataset.v; render(); jobFocusGo(); }
  else if (a === 'jfnew') { S.jf.result = null; S.jf.text = ''; S.jf.sel = 0; render(); }
  else if (a === 'jfopen') { const j = jfAll().find(x => x.id === b.dataset.id); if (j) { S.jf.result = j; S.jf.text = j.text || ''; } render(); }
  else if (a === 'jfdeck') startSkillDeck(Number(b.dataset.i) || 0);
  else if (a === 'jfdel') { if (confirm('Remove this job post and its decks?')) { jfRemove(S.jf.result?.id); const n = jfSaved(); S.jf.result = n; S.jf.text = n?.text || ''; render(); } }
  else if (a === 'pickfree') { S.showPlans = false; render(); }
  else if (a === 'unpaywall') { S.paywall = false; render(); }
  else if (a === 'buysub') buy('pro');
  else if (a === 'buylive') buy('live');
  else if (a === 'livesetup') liveSetupSheet();
  else if (a === 'restore') buy('restore');
  else if (a === 'rtrespond') S.rt?.respond();
  else if (a === 'rtinterrupt') S.rt?.interrupt();
  else if (a === 'rtmute') { S.muted = !S.muted; S.rt?.setMuted(S.muted); render(); }
  else if (a === 'rtsound') { S.soundOff = !S.soundOff; S.rt?.setSoundOff(S.soundOff); render(); }
  else if (a === 'rtstop') S.rt?.stop();
  else if (a === 'livepause') pauseLive();
  else if (a === 'liveresume') {
    // A new call does not remember the old one: hand it the last few turns so it carries on.
    const turns = store.chat().filter(m => !isNotice(m)).slice(-8).map(m => `${m.role === 'user' ? 'Candidate' : 'You'}: ${m.content}`).join('\n');
    S.resumeCtx = `${S.chatContext ? S.chatContext + '\n\n' : ''}The session was paused and is now resuming. Do not greet or re-introduce yourself; say one short line like "Welcome back" and continue from here.\nConversation so far:\n${turns}`.slice(-3000);
    S.livePaused = null; startVoice('live');
  }
  else if (a === 'livediscard') { S.livePaused = null; render(); }
  else if (a === 'nsignin') nativeSignIn(b.dataset.p);
  else if (a === 'signout') {
    sheet(`<h2>Sign out?</h2>
      <p class="muted">Your profile, card progress, chats and saved job posts are removed from this device, so the next person starts fresh. Your purchases stay with your account.</p>
      <div class="row"><button class="btn grow" data-act="closesheet">Cancel</button><button class="btn danger" data-act="signout-yes">Sign out</button></div>`);
  }
  else if (a === 'signout-yes') {
    closeSheet(); S.rt?.stop(); await S.flushUserData?.(); signOut(); store.clearUser();
    Object.assign(S, { paywall: false, guest: false, onboard: false, view: 'home', adminSug: null, deck: null, draft: null, jf: null, livePaused: null, liveBrief: null, chatContext: '', prevMap: null, pickMode: null });
    render(); scrollToY(0);
  }
  else if (a === 'delacct') {
    sheet(`<h2>Delete your account?</h2>
      <p class="muted">This removes your email, plan and AI usage from our servers right away. It does not cancel a Pro subscription: do that in your ${window.PP_PLATFORM === 'android' ? 'Google Play' : 'Apple ID'} subscription settings.</p>
      <div class="row"><button class="btn grow" data-act="closesheet">Keep my account</button><button class="btn danger" data-act="delacct-yes">Delete permanently</button></div>`);
  }
  else if (a === 'delacct-yes') {
    closeSheet();
    try {
      await ai.post('/api/me/delete', {});
      S.rt?.stop(); signOut(); S.paywall = false; render();
      toast('Account deleted. Remember to cancel any Pro subscription in your store settings.');
    } catch (err) { oops(err.message); }
  }
  else if (a === 'dropctx') { S.chatContext = ''; render(); }
  else if (a === 'clearchat') { store.setChat([]); S.chatContext = ''; render(); }
  else if (a === 'mic') {
    if (S.listening) { voice.stopListening(); return; }
    voice.stopSpeaking();
    S.listening = true; render();
    const input = () => document.getElementById('chatInput');
    try {
      const text = await voice.listen({ onInterim: t => { if (input()) input().value = t; } });
      S.listening = false; if (input()) input().value = ''; render();
      if (text) sendChat(text, { fromVoice: true });
    } catch (err) { S.listening = false; render(); oops(err.message); }
  }
  else if (a === 'delcustom') { store.setCustomTopics(store.customTopics().filter(t => t.id !== id)); render(); }
  else if (a === 'delpack') { store.setPrivatePacks(store.privatePacks().filter(p => p.id !== id)); render(); }
  else if (a === 'export') {
    const blob = new Blob([JSON.stringify({ profile: profile(), progress: store.progress(), customTopics: store.customTopics() }, null, 1)], { type: 'application/json' });
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'preppilot-data.json' });
    link.click(); URL.revokeObjectURL(link.href);
  }
  else if (a === 'reset') {
    sheet(`<h2>Erase everything on this device?</h2>
      <p class="muted">Your profile, card progress, chats and custom topics will be removed, and you will be signed out. Purchases stay with your account.</p>
      <div class="row"><button class="btn grow" data-act="closesheet">Cancel</button><button class="btn danger" data-act="reset-yes">Erase</button></div>`);
  }
  else if (a === 'reset-yes') { closeSheet(); S.rt?.stop(); store.resetAll(); signOut(); S.view = 'home'; S.deck = null; S.draft = null; render(); }
});

/* ---------- boot ---------- */
(async function boot() {
  try {
    await initContent();
    loadNudges().catch(() => {});
    const p = profile();
    if (p) {
      const migrated = migrateProfile(p);
      if (JSON.stringify(migrated) !== JSON.stringify(p)) store.setProfile(migrated);
      await ensureForProfile(migrated);
    }
  } catch {
    app.innerHTML = '<p class="note warn">Could not load study content. Check your connection and reload.</p>';
    return;
  }
  // Custom subjects carry their diagram with them; register the stored ones
  // so their story strips work from the first render.
  store.customTopics().forEach(t => { if (t.diagram) registerDiagramSpec(t.id, t.diagram); });
  render();
  // Account changes (sign-in, usage updates, purchases) re-render unless a voice reply is streaming.
  // Start from the stored account so the plans screen opens on a fresh sign-in, not on every launch.
  let prevAccount = store.account();
  // Profile and card progress live with the account too: saved a few seconds after a change,
  // restored on sign-in when this device has none (e.g. after signing out).
  let syncTimer = 0;
  const pushUserData = () => { clearTimeout(syncTimer); syncTimer = 0; if (!signedIn() || !profile()) return Promise.resolve();
    return ai.post('/api/me/data/save', { profile: profile(), progress: store.progress() }).catch(() => {}); };
  store.onUserData = () => { if (!signedIn()) return; clearTimeout(syncTimer); syncTimer = setTimeout(pushUserData, 4000); };
  S.flushUserData = pushUserData;
  // Save at once when the tab is hidden or closed (keepalive lets the request finish).
  document.addEventListener('visibilitychange', () => { if (document.hidden && syncTimer) pushUserData(); });
  let restoredFor = '';
  const restoreUserData = async () => {
    const who = store.session(); if (!who || restoredFor === who) return; restoredFor = who;
    try {
      const d = await ai.post('/api/me/data', {});
      // A profile set up on this device while signed out (Get started before Log in) must not
      // replace the one saved with the account: the saved one wins.
      const guestLocal = lsGet('pp.profileGuest', '') === '1';
      lsSet('pp.profileGuest', '');
      if (d.profile && (!profile() || guestLocal)) {
        store.setProfile(d.profile);
        if (d.progress) store.setProgress({ ...d.progress, ...store.progress() });
        await ensureForProfile(profile()).catch(() => {});
        S.onboard = false; S.view = 'home'; render();
        toast('Welcome back. Your plan and progress are restored.');
      } else if (profile()) pushUserData();
    } catch { /* offline: try again next sign-in */ }
  };
  onAccountChange(acc => { if (acc) restoreUserData(); });
  if (signedIn()) restoreUserData(); // app opened already signed in
  onAccountChange(acc => {
    if (acc && S.login) { S.login = false; S.view = 'home'; if (!profile()) S.onboard = true; }
    if (acc && !prevAccount && acc.plan === 'free' && profile() && !acc.unlimited) S.showPlans = true;
    if (acc && !prevAccount && store.lastProvider() === 'google' && !store.suggestAsked()) S.suggestPending = true;
    prevAccount = acc;
    if (!acc || (acc.plan === 'free' && acc.msgsLeft > 0 && acc.voiceSecLeft >= 20)) S.paywall = false;
    if (!S.live) render();
  });
  listenNative({
    onError: msg => { buyDone(); render(); oops(msg); },
    onCancelled: () => { buyDone(); render(); },
    onPurchased,
  });
  refreshAccount().catch(() => {});
  // Pre-warm the API (avoids a cold start when the user first talks) and learn what's enabled.
  ai.health().then(h => {
    S.voiceServer = !!h.voice; S.googleClientId = h.googleClientId || ''; S.plans = h.plans || null; S.liveInterviewIos = !!h.liveInterviewIos; S.healthLoaded = true;
    render();
  }).catch(() => { S.healthLoaded = true; });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !window.Capacitor) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
