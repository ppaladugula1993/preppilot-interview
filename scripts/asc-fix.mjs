// Fills the gaps the App Store check found on the new app: Live AI price, copyright, content rights,
// category, age rating answers (no mature content) and the app name. Safe to rerun.
import { createSign } from 'node:crypto';

const { ASC_KEY_ID: kid, ASC_ISSUER_ID: iss, ASC_KEY_P8: p8 } = process.env;
const APP = process.env.APP_ID, IAP = process.env.IAP_ID;
const NAMES = ['PrepPilot: Interview Prep', 'PrepPilot - Interview Prep', 'PrepPilot: Tech Interview Prep'];
const b64u = v => Buffer.from(JSON.stringify(v)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = `${b64u({ alg: 'ES256', kid, typ: 'JWT' })}.${b64u({ iss, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' })}`;
const token = `${head}.${createSign('SHA256').update(head).sign({ key: p8.replace(/\\n/g, '\n'), dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
const API = 'https://api.appstoreconnect.apple.com';
async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  const data = text ? JSON.parse(text) : {};
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(data.errors?.map(e => e.detail || e.title))}`);
  return data;
}
const step = async (label, fn) => { try { const r = await fn(); console.log(`✓ ${label}${r ? ` (${r})` : ''}`); return true; } catch (e) { console.log(`✗ ${label}: ${e.message}`); return false; } };

// Live AI price $15.99
await step('Live AI price $15.99', async () => {
  let next = `/v2/inAppPurchases/${IAP}/pricePoints?filter[territory]=USA&limit=200`, pp = null;
  while (next && !pp) { const d = await api('GET', next.replace(API, '')); pp = d.data.find(x => x.attributes.customerPrice === '15.99'); next = d.links?.next || null; }
  if (!pp) throw new Error('no $15.99 price point');
  await api('POST', '/v1/inAppPurchasePriceSchedules', { data: { type: 'inAppPurchasePriceSchedules', relationships: { inAppPurchase: { data: { type: 'inAppPurchases', id: IAP } }, baseTerritory: { data: { type: 'territories', id: 'USA' } }, manualPrices: { data: [{ type: 'inAppPurchasePrices', id: '${p1}' }] } } },
    included: [{ type: 'inAppPurchasePrices', id: '${p1}', attributes: { startDate: null }, relationships: { inAppPurchasePricePoint: { data: { type: 'inAppPurchasePricePoints', id: pp.id } } } }] });
});

// Content rights
await step('Content rights: no third-party content', () => api('PATCH', `/v1/apps/${APP}`, { data: { type: 'apps', id: APP, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } } }));

// Copyright on the version being prepared
const ver = (await api('GET', `/v1/apps/${APP}/appStoreVersions?limit=5`)).data.find(v => v.attributes.appStoreState === 'PREPARE_FOR_SUBMISSION');
if (ver) await step('Copyright "2026 PrepPilot"', () => api('PATCH', `/v1/appStoreVersions/${ver.id}`, { data: { type: 'appStoreVersions', id: ver.id, attributes: { copyright: '2026 PrepPilot' } } }));

// Category, age rating, name
const info = (await api('GET', `/v1/apps/${APP}/appInfos`)).data.find(i => (i.attributes.appStoreState || i.attributes.state) !== 'READY_FOR_DISTRIBUTION');
await step('Category: Education (secondary: Productivity)', () => api('PATCH', `/v1/appInfos/${info.id}`, { data: { type: 'appInfos', id: info.id,
  relationships: { primaryCategory: { data: { type: 'appCategories', id: 'EDUCATION' } }, secondaryCategory: { data: { type: 'appCategories', id: 'PRODUCTIVITY' } } } } }));
const ar = (await api('GET', `/v1/appInfos/${info.id}/ageRatingDeclaration`)).data;
const answers = {};
for (const [k, v] of Object.entries(ar.attributes)) {
  if (v !== null) continue;
  if (/^(kidsAgeBand|ageRatingOverride|ageRatingOverrideV2|koreaAgeRatingOverride|developerAgeRatingInfoUrl)$/.test(k)) continue;
  answers[k] = /Content|Themes|Violence|Profanity|Humor|Horror|Alcohol|Drugs|Tobacco|Sexual|Nudity|Gambling|Medical|Treatment|Weapons|Mature|Suggestive|Fear|Competitions|Contests|Simulated/i.test(k) && !/^(gambling|lootBox|unrestrictedWebAccess|seventeenPlus|healthOrWellnessTopics|parentalControls|ageAssurance|messagingAndChat|userGeneratedContent|advertising)$/.test(k) ? 'NONE' : false;
}
await step(`Age rating: ${Object.keys(answers).length} answers (no mature content)`, () => api('PATCH', `/v1/ageRatingDeclarations/${ar.id}`, { data: { type: 'ageRatingDeclarations', id: ar.id, attributes: answers } }).catch(async e => {
  // A wrong type for one answer fails the whole request: retry each answer on its own, flipping NONE/false if needed.
  let ok = 0;
  for (const [k, v] of Object.entries(answers)) {
    for (const val of [v, v === false ? 'NONE' : false]) {
      try { await api('PATCH', `/v1/ageRatingDeclarations/${ar.id}`, { data: { type: 'ageRatingDeclarations', id: ar.id, attributes: { [k]: val } } }); ok++; break; } catch { /* try the other type */ }
    }
  }
  return `${ok} set one by one`;
}));
const loc = (await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`)).data.find(l => l.attributes.locale === 'en-US');
for (const name of NAMES) {
  if (loc.attributes.name === name) { console.log(`✓ App name already "${name}"`); break; }
  if (await step(`App name "${name}"`, () => api('PATCH', `/v1/appInfoLocalizations/${loc.id}`, { data: { type: 'appInfoLocalizations', id: loc.id, attributes: { name } } }))) break;
}
