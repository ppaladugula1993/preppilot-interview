#!/usr/bin/env node
// Makes one topic's explainer video end to end, safe to rerun:
//   script (AI, from the topic's own cards) -> fact check -> voice -> render -> compress -> upload -> manifest.
//   node make.mjs <topicId> [--force]
// Needs AZURE_OPENAI_ENDPOINT/KEY, AZURE_SPEECH_KEY/REGION and VIDEO_STORAGE (blob connection string).
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), root = resolve(here, '..');
const id = process.argv[2], force = process.argv.includes('--force');
if (!id) { console.error('usage: node make.mjs <topicId>'); process.exit(1); }
const ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, ''), KEY = process.env.AZURE_OPENAI_API_KEY;
const DEPLOY = process.env.SCRIPT_DEPLOYMENT || 'gpt-4.1';
const BLOB = 'https://ppvideos7k2.blob.core.windows.net/videos';
const MANIFEST = resolve(root, 'web/content/videos.json');
const log = m => console.log(`[${id}] ${m}`);

// ---------- topic content ----------
let topic;
for (const f of readdirSync(resolve(root, 'web/content/packs')).filter(f => f.endsWith('.json') && f !== 'index.json')) {
  const p = JSON.parse(readFileSync(resolve(root, 'web/content/packs', f), 'utf8'));
  topic = (p.topics || []).find(t => t.id === id) || topic;
}
if (!topic) { console.error(`unknown topic ${id}`); process.exit(1); }

async function ask(sys, user, max, temperature = 0.4) {
  for (let a = 0; a < 4; a++) {
    const r = await fetch(`${ENDPOINT}/openai/deployments/${DEPLOY}/chat/completions?api-version=2024-10-21`, { method: 'POST', headers: { 'content-type': 'application/json', 'api-key': KEY },
      body: JSON.stringify({ messages: [{ role: 'system', content: sys }, { role: 'user', content: user }], temperature, max_tokens: max, response_format: { type: 'json_object' } }), signal: AbortSignal.timeout(180000) });
    if (r.status === 429 || r.status >= 500) { await new Promise(x => setTimeout(x, 5000 * (a + 1))); continue; }
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    return JSON.parse((await r.json()).choices[0].message.content);
  }
  throw new Error('AI gave up');
}

// ---------- 1. script ----------
const scriptFile = resolve(here, 'topics', `${id}.json`);
async function writeScript(feedback = '') {
  const cards = topic.qa.slice(0, 18).map(q => `Q: ${q.q}\nA: ${q.a}${q.why ? `\nWhy: ${q.why}` : ''}${q.trap ? `\nTrap: ${q.trap}` : ''}`).join('\n\n');
  const lessons = (topic.concepts || []).slice(0, 8).map(c => `${c.t}: ${c.what}`).join('\n');
  const sys = `You write 40-50 second vertical explainer videos for software engineers preparing for interviews. Casual, clear, confident narrator; short spoken sentences; no filler. Output ONLY JSON.`;
  const user = `Topic: ${topic.name} (${topic.blurb || ''})
Make ONE video that explains the single most important idea of this topic so it sticks, using only facts from the material below.
Structure: hook question → 4 to 6 teaching scenes that build up the idea → one interview trap → end card. Total narration 105 to 130 words.
Each scene: {"id": short-slug, "type": one of hook|chip|terminal|rows|compare|code|trap|end, "say": narration for that scene, plus the fields for its type}:
- hook: kicker (e.g. "${topic.name} · 45 seconds"), line1 (max 40 chars), line2 (max 22 chars, the question)
- chip: kicker, label (1 word, max 8 chars, e.g. "API" or "Pod"), sub (max 70 chars)
- terminal: kicker, title, lines (2-5 real commands/output lines, max 34 chars each, commands start with "$ ")
- rows: kicker, rows (3-5 items {a: max 18 chars, b: max 28 chars}), walk (true for ordered steps)
- compare: kicker, left {title, items: 2-3 short items}, right {title, items}
- code: kicker, lang, code (max 8 lines, max 34 chars per line, real and correct)
- trap: question (max 40 chars), wrong (the common wrong answer, max 40 chars), right (max 60 chars)
- end: say must be exactly "Get interview ready with PrepPilot."
Kickers are short, like "Step 1 · Firmware". Use at least 3 different scene types. Spell acronyms for speech in "say" only when needed (e.g. "P I D"), never in on-screen fields.
${feedback ? `Fix these problems from the review: ${feedback}\n` : ''}
Return {"title": "video title, max 40 chars", "keys": [3-6 key terms to colour in captions], "scenes": [...]}.

Lessons:
${lessons}

Cards:
${cards}`;
  return ask(sys, user, 2500);
}
async function check(script) {
  const r = await ask('You are a strict technical reviewer of a short interview-prep video script. Output ONLY JSON: {"ok": true|false, "problems": "short list"}. ok=false if any fact, command or code is wrong or misleading, or the trap is not actually a common mistake.',
    `Topic: ${topic.name}\nScript:\n${JSON.stringify(script)}`, 600, 0);
  return r;
}
const valid = s => Array.isArray(s?.scenes) && s.scenes.length >= 5 && s.scenes[0].type === 'hook' && s.scenes.at(-1).type === 'end' && s.scenes.every(x => x.id && x.say);
let script = !force && existsSync(scriptFile) ? JSON.parse(readFileSync(scriptFile, 'utf8')) : null;
if (!script) {
  let fb = '';
  for (let k = 0; k < 3 && !script; k++) {
    const s = await writeScript(fb);
    if (!valid(s)) { fb = 'Follow the scene structure exactly (hook first, end last, every scene has id and say).'; continue; }
    s.scenes.forEach((x, i) => { x.id = `${i}-${String(x.id).replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 's'}`; });
    const c = await check(s);
    if (c.ok === true || c.ok === 'true') script = s; else { fb = c.problems || 'facts'; log(`review: ${fb}`); }
  }
  if (!script) throw new Error('no script passed review');
  script.voice = 'en-US-AndrewMultilingualNeural';
  mkdirSync(resolve(here, 'topics'), { recursive: true });
  writeFileSync(scriptFile, JSON.stringify({ id, ...script }, null, 2));
  log(`script ok: ${script.title}`);
}

// ---------- 2. voice ----------
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: here, stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString();
if (force || !existsSync(resolve(here, 'public', `${id}.timing.json`))) {
  const tts = JSON.parse(readFileSync(scriptFile, 'utf8'));
  writeFileSync(resolve(here, `.tts-${id}.json`), JSON.stringify({ id, voice: tts.voice || 'en-US-AndrewMultilingualNeural', scenes: tts.scenes.map(s => ({ id: s.id, text: s.say })) }));
  log(run('node', ['tts.mjs', `.tts-${id}.json`]).trim());
}

// ---------- 3. render + compress ----------
const out = resolve(here, 'out'); mkdirSync(out, { recursive: true });
const final = resolve(out, `${id}.mp4`), poster = resolve(out, `${id}.jpg`);
if (force || !existsSync(final)) {
  const s = JSON.parse(readFileSync(scriptFile, 'utf8'));
  const timing = JSON.parse(readFileSync(resolve(here, 'public', `${id}.timing.json`), 'utf8'));
  writeFileSync(resolve(here, `.props-${id}.json`), JSON.stringify({ id, title: s.title, scenes: s.scenes, timing, audio: `${id}.mp3`, keys: s.keys || [] }));
  run('npx', ['remotion', 'render', 'src/index.ts', 'topic', `out/${id}.raw.mp4`, `--props=.props-${id}.json`, '--browser-executable=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '--log=error'], { timeout: 1800000 });
  run('ffmpeg', ['-loglevel', 'error', '-y', '-i', `out/${id}.raw.mp4`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', `out/${id}.mp4`]);
  run('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '1.2', '-i', `out/${id}.mp4`, '-frames:v', '1', '-vf', 'scale=540:-1', '-q:v', '5', `out/${id}.jpg`]);
  log(`rendered ${(statSync(final).size / 1e6).toFixed(1)} MB`);
}

// ---------- 4. upload ----------
const { BlobServiceClient } = await import('@azure/storage-blob');
const container = BlobServiceClient.fromConnectionString(process.env.VIDEO_STORAGE).getContainerClient('videos');
for (const [file, type] of [[final, 'video/mp4'], [poster, 'image/jpeg']]) {
  await container.getBlockBlobClient(file.split('/').pop()).uploadFile(file, { blobHTTPHeaders: { blobContentType: type, blobCacheControl: 'public, max-age=86400' } });
}
log('uploaded');

// ---------- 5. manifest ----------
const s = JSON.parse(readFileSync(scriptFile, 'utf8'));
const timing = JSON.parse(readFileSync(resolve(here, 'public', `${id}.timing.json`), 'utf8'));
const quizIdx = Math.max(0, topic.qa.findIndex(q => q.l === 1));
const m = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { videos: [] };
m.videos = m.videos.filter(v => v.topic !== id);
m.videos.push({ topic: id, title: s.title, url: `${BLOB}/${id}.mp4`, poster: `${BLOB}/${id}.jpg`, duration: Math.round(timing.duration), quiz: quizIdx });
m.videos.sort((a, b) => a.topic.localeCompare(b.topic)); m.updated = new Date().toISOString();
writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + '\n');
log(`manifest: ${m.videos.length} videos`);
