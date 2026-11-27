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
// <topicId> makes the topic overview; <topicId>:<n> makes the video for lesson n (0-based).
const arg = process.argv[2], force = process.argv.includes('--force');
if (!arg) { console.error('usage: node make.mjs <topicId>[:<lesson>]'); process.exit(1); }
const [topicId, lessonStr] = arg.split(':');
const lessonN = lessonStr === undefined ? null : Number(lessonStr);
const id = lessonN === null ? topicId : `${topicId}-l${lessonN}`;
const ENDPOINT = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, ''), KEY = process.env.AZURE_OPENAI_API_KEY;
const DEPLOY = process.env.SCRIPT_DEPLOYMENT || 'gpt-4.1';
const BLOB = 'https://ppvideos7k2.blob.core.windows.net/videos';
const MANIFEST = resolve(root, 'web/content/videos.json');
const log = m => console.log(`[${id}] ${m}`);

// ---------- topic content ----------
let topic;
for (const f of readdirSync(resolve(root, 'web/content/packs')).filter(f => f.endsWith('.json') && f !== 'index.json')) {
  const p = JSON.parse(readFileSync(resolve(root, 'web/content/packs', f), 'utf8'));
  topic = (p.topics || []).find(t => t.id === topicId) || topic;
}
if (!topic) { console.error(`unknown topic ${topicId}`); process.exit(1); }
const lesson = lessonN === null ? null : topic.concepts?.[lessonN];
if (lessonN !== null && !lesson) { console.error(`no lesson ${lessonN} in ${topicId}`); process.exit(1); }

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
  if (lesson) return writeLessonScript(feedback);
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
Kickers are short, like "Step 1 · Firmware". Use at least 3 different scene types. The "say" narration is spoken by a friendly engineer: never read symbols, paths, commands or code out literally (no "slash", "dot", "dash", "underscore", "colon", brackets or quotes read aloud). Say what it means in plain words instead, e.g. "the systemd settings folder" not "/etc/systemd", "the list units command" not "systemctl list-units". Exact paths, commands and code go only in on-screen fields. Spell acronyms for speech in "say" only when needed (e.g. "P I D"), never in on-screen fields.
${feedback ? `Fix these problems from the review: ${feedback}\n` : ''}
EVERY scene, including hook, picture, chip and trap, MUST have a "say" field with its spoken narration.
Return {"title": "video title, max 40 chars", "keys": [3-6 key terms to colour in captions], "scenes": [...]}.

Lessons:
${lessons}

Cards:
${cards}`;
  return ask(sys, user, 2500);
}
async function writeLessonScript(feedback) {
  const words = (lesson.t || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3);
  const related = topic.qa.filter(q => words.some(w => q.q.toLowerCase().includes(w) || q.a.toLowerCase().includes(w))).slice(0, 6);
  const cards = (related.length ? related : topic.qa.slice(0, 4)).map(q => `Q: ${q.q}\nA: ${q.a}${q.trap ? `\nTrap: ${q.trap}` : ''}`).join('\n\n');
  const sys = 'You write 30-40 second vertical explainer videos for software engineers preparing for interviews. Casual, clear, confident narrator; short spoken sentences; no filler. Output ONLY JSON.';
  const user = `Topic: ${topic.name}. Lesson: ${lesson.t}
Make ONE short video that teaches exactly this lesson so it sticks, using only facts from the material below.
Structure: hook question → 3 to 4 teaching scenes → one interview trap → end card. Total narration 80 to 105 words.
Each scene: {"id": short-slug, "type": one of hook|chip|terminal|rows|compare|code|trap|end, "say": narration for that scene, plus the fields for its type}:
- hook: kicker (e.g. "${topic.name} · lesson"), line1 (max 40 chars), line2 (max 22 chars, the question)
- chip: kicker, label (1 word, max 8 chars), sub (max 70 chars)
- terminal: kicker, title, lines (2-5 real commands/output lines, max 34 chars each, commands start with "$ ")
- rows: kicker, rows (3-5 items {a: max 18 chars, b: max 28 chars}), walk (true for ordered steps)
- compare: kicker, left {title, items: 2-3 short items}, right {title, items}
- code: kicker, lang, code (max 8 lines, max 34 chars per line, real and correct)
- trap: question (max 40 chars), wrong (max 40 chars), right (max 60 chars)
- end: say must be exactly "Get interview ready with PrepPilot."
Use at least 2 different teaching scene types. The "say" narration is spoken by a friendly engineer: never read symbols, paths, commands or code out literally (no "slash", "dot", "dash", "underscore", "colon", brackets or quotes read aloud). Say what it means in plain words instead, e.g. "the systemd settings folder" not "/etc/systemd", "the list units command" not "systemctl list-units". Exact paths, commands and code go only in on-screen fields. Spell acronyms for speech in "say" only when needed, never in on-screen fields.
${feedback ? `Fix these problems from the review: ${feedback}\n` : ''}
EVERY scene, including hook, picture, chip and trap, MUST have a "say" field with its spoken narration.
Return {"title": "max 40 chars", "keys": [2-5 key terms], "scenes": [...]}.

Lesson:
${lesson.t}: ${lesson.what}${lesson.why ? `\nWhy it matters: ${lesson.why}` : ''}${lesson.ex ? `\nExample: ${lesson.ex}` : ''}${lesson.tip ? `\nTip: ${lesson.tip}` : ''}

Related cards:
${cards}`;
  return ask(sys, user, 2000);
}
async function check(script) {
  const r = await ask('You are a strict technical reviewer of a short interview-prep video script. Output ONLY JSON: {"ok": true|false, "problems": "short list"}. ok=false if any fact, command or code is wrong or misleading, or if "say" reads symbols or paths aloud (like "slash" or "dot"), or the trap is not actually a common mistake. Picture scenes are deliberate real-world analogies: do NOT reject an analogy for being simplified, only if it teaches something false. Minor wording is fine; reject only real errors.',
    `Topic: ${topic.name}\nScript:\n${JSON.stringify(script)}`, 600, 0);
  return r;
}
const VSTYLE = process.env.VIDEO_STYLE || 'topic', BRAIN = VSTYLE === 'brain';
const BRAIN_STYLE = 'Flat vector motion graphics style, dark background #0A0A0F, minimal 2D illustration, thick outlines, electric yellow #FFE500 accent and cyan #00E5FF for diagram lines, no shadows, no photorealism, clean infographic, no text, no letters, no numbers';
async function writeBrain(feedback) {
  const words = lesson ? (lesson.t || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 3) : [];
  const pool = lesson ? topic.qa.filter(q => words.some(w => q.q.toLowerCase().includes(w) || q.a.toLowerCase().includes(w))).slice(0, 6) : topic.qa.slice(0, 16);
  const cards = (pool.length ? pool : topic.qa.slice(0, 4)).map(q => `Q: ${q.q}\nA: ${q.a}${q.trap ? `\nTrap: ${q.trap}` : ''}`).join('\n\n');
  const material = lesson ? `Lesson: ${lesson.t}: ${lesson.what}${lesson.why ? `\nWhy: ${lesson.why}` : ''}${lesson.ex ? `\nExample: ${lesson.ex}` : ''}` : (topic.concepts || []).slice(0, 8).map(c => `${c.t}: ${c.what}`).join('\n');
  const n = lesson ? '7-9 scenes, about 40 seconds, 95-110 words' : '10-12 scenes, about 60 seconds, 145-160 words';
  const sys = 'You are a motion-graphics explainer studio in the BrainrotShorts style for software engineers preparing for interviews. Output ONLY JSON.';
  const user = `Topic: ${topic.name}${lesson ? ` · lesson: ${lesson.t}` : ''}
Write ONE explainer video using only facts from the material below. ${n}, each scene 4-6 seconds (about 2.5 words per second).
Tone: simple, punchy, curious; explain like to a smart 15-year-old; explain any jargon. Narration must be speakable word-for-word: no brackets, no emojis.
Structure: Hook -> Problem -> How it works in 3 steps -> Twist / interview trap / why it matters -> End line. The last scene's narration is exactly "Get interview ready with PrepPilot."
Return {"title": "short viral title, max 40 chars", "scenes": [{"narration_text": "...", "on_screen_title": "ALL CAPS, max 5 words, never a section label like HOOK, STEP 1 or TWIST", "accent_word": "ONE word or number that appears in on_screen_title", "subtitle": "max 6 words", "visual": {"layout": "single|flow|stack|compare|hub|list|grid", "items": [{"icon": "lucide icon name", "label": "max 12 chars", "good": true}]}}]}
Visual = a clean animated diagram drawn from icons, chosen to SHOW what the narration says:
- single: 1 item, one big idea. flow: 2-4 items in order with arrows (steps, request path). stack: 2-5 layers bottom to top. compare: exactly 2 items (X vs Y). hub: first item in the centre, 3-5 around it. list: 2-4 items with good true/false (do / don't). grid: 3-6 items (many of something).
Icons are Lucide names, e.g. box, boxes, package, container, ship, server, database, cpu, memory-stick, hard-drive, cloud, globe, network, wifi, router, monitor, laptop, smartphone, code, terminal, file, file-code, folder, git-branch, git-merge, layers, layout-grid, cog, settings, wrench, hammer, rocket, zap, timer, clock, gauge, shield, lock, key, user, users, bug, check, x, alert-triangle, search, filter, list, table, chart-bar, trending-up, arrow-right, repeat, refresh-cw, trash-2, copy, link, mail, message-square, bell, coffee, brain, lightbulb, puzzle, sparkles, workflow, binary, braces, hash, image, play, pause, power, plug, cable, flame, snowflake, scale, anchor, truck, factory, warehouse, building, home, book, graduation-cap, trophy, target.
Use 2-4 different layouts across the video. Labels are short, ALL CAPS friendly.
${feedback ? `Fix these problems from the review: ${feedback}\n` : ''}
Material:
${material}

Cards:
${cards}`;
  const r = await ask(sys, user, 3000);
  const scenes = (r?.scenes || []).map((x, i) => ({ id: `s${i}`, type: i === 0 ? 'hook' : i === (r.scenes.length - 1) ? 'end' : 'chip', say: String(x.narration_text || '').replace(/[\[\]]/g, ''), title: x.on_screen_title || '', accent: x.accent_word || '', subtitle: x.subtitle || '', visual: x.visual || { layout: 'single', items: [{ icon: 'box' }] } }));
  return { title: r?.title, scenes };
}
const valid = s => Array.isArray(s?.scenes) && s.scenes.length >= (lesson ? 4 : 5) && s.scenes[0].type === 'hook' && s.scenes.at(-1).type === 'end' && s.scenes.every(x => x.id && x.say);
let script = !force && existsSync(scriptFile) ? JSON.parse(readFileSync(scriptFile, 'utf8')) : null;
if (script && !script.scenes?.every(x => x.say)) script = null; // old hand-made format
const freshScript = !script;
if (!script) {
  let fb = '';
  for (let k = 0; k < 4 && !script; k++) {
    const s = BRAIN ? await writeBrain(fb) : await writeScript(fb);
    (s?.scenes || []).forEach(x => { if (!x.say && x.type === 'hook') x.say = `${x.line1} ${x.line2}`; if (!x.say && x.type === 'end') x.say = 'Get interview ready with PrepPilot.'; });
    if (!valid(s)) { log('invalid: ' + (s?.scenes || []).filter(x => !x.say).map(x => x.type).join(',')); fb = 'Follow the scene structure exactly (hook first, end last, every scene has id and say).'; continue; }
    if (VSTYLE !== 'topic' && !BRAIN && (!s.cast?.length || !s.sets?.length)) { fb = 'Include sets and cast, and actors in every scene.'; log('no cast'); continue; }
    if (!BRAIN) s.scenes.forEach((x, i) => { x.id = `${i}-${String(x.id).replace(/[^a-z0-9-]/gi, '').slice(0, 20) || 's'}`; });
    const c = await check(s);
    if (c.ok === true || c.ok === 'true') script = s; else { fb = c.problems || 'facts'; log(`review: ${fb}`); }
  }
  if (!script) throw new Error('no script passed review');
  script.voice = BRAIN ? 'en-US-ChristopherNeural' : 'en-US-AndrewMultilingualNeural';
  mkdirSync(resolve(here, 'topics'), { recursive: true });
  writeFileSync(scriptFile, JSON.stringify({ id, ...script }, null, 2));
  log(`script ok: ${script.title}`);
}

// ---------- 2. voice ----------
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: here, stdio: ['ignore', 'pipe', 'pipe'], ...opts }).toString();
if (force || freshScript || !existsSync(resolve(here, 'public', `${id}.timing.json`))) {
  const tts = JSON.parse(readFileSync(scriptFile, 'utf8'));
  writeFileSync(resolve(here, `.tts-${id}.json`), JSON.stringify({ id, rate: BRAIN ? '+0%' : VSTYLE === 'topic' ? '+6%' : '+14%', voice: tts.voice || 'en-US-AndrewMultilingualNeural', scenes: tts.scenes.map(s => ({ id: s.id, text: s.say })) }));
  log(run('node', ['tts.mjs', `.tts-${id}.json`]).trim());
}

// ---------- 2b. pictures: one per scene, art style + theme + loop picked per video so they all look different ----------
const hash = str => [...str].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const H = hash(id), STYLE = 'soft flat 2D pastel illustration, simple rounded shapes, minimal detail, calm muted colours, gentle lighting, clean and uncluttered, friendly but not exaggerated, no faces on objects, no text, no letters, no numbers, no logos, no screens.';
async function draw(prompt, file, transparent, square) {
  for (let a = 0; a < 6 && !existsSync(file); a++) {
    const r = await fetch(`${ENDPOINT}/openai/deployments/${process.env.IMAGE_DEPLOYMENT || 'gpt-image-1-mini'}/images/generations?api-version=2025-04-01-preview`, { method: 'POST', headers: { 'content-type': 'application/json', 'api-key': KEY },
      body: JSON.stringify({ prompt, size: transparent || square ? '1024x1024' : '1024x1536', quality: 'low', n: 1, ...(transparent ? { background: 'transparent', output_format: 'png' } : {}) }), signal: AbortSignal.timeout(180000) });
    if (!r.ok) { log(`image retry ${r.status} ${r.status === 400 ? (await r.text()).slice(0, 160) : ''}`); await new Promise(x => setTimeout(x, 12000 * (a + 1))); continue; }
    const raw = resolve(here, 'public', `raw-${file.split('/').pop()}.png`);
    writeFileSync(raw, Buffer.from((await r.json()).data[0].b64_json, 'base64'));
    run('ffmpeg', ['-loglevel', 'error', '-y', '-i', raw, ...(transparent ? ['-vf', 'scale=512:-1', file] : ['-q:v', '3', file])]);
  }
  return existsSync(file);
}
{
  const sf = JSON.parse(readFileSync(scriptFile, 'utf8')); let n = 0;
  if (BRAIN && process.env.BRAIN_IMAGES) for (const sc of sf.scenes.filter(x => x.prompt && x.type !== 'end')) { const name = `${id}-${sc.id}.jpg`; if (await draw(`${sc.prompt}. ${BRAIN_STYLE}. Single centered subject, plenty of empty #0A0A0F space around it.`, resolve(here, 'public', name), false, true)) { sc.image = name; n++; } }
  for (const st of sf.sets || []) { const name = `${id}-set-${st.name}.jpg`; if (await draw(`${st.prompt}. Wide empty background scene for an animation, no characters in front. ${STYLE}`, resolve(here, 'public', name), false)) { st.image = name; n++; } }
  for (const c of sf.cast || []) { const name = `${id}-cast-${c.name}.png`; if (await draw(`${c.prompt}. Single isolated cut-out sprite on a fully transparent background, whole object visible, centered, bold outline. ${STYLE}`, resolve(here, 'public', name), true)) { c.image = name; n++; } }
  writeFileSync(scriptFile, JSON.stringify(sf, null, 2));
  log(`pictures: ${n}`);
}

// ---------- 3. render + compress ----------
const out = resolve(here, 'out'); mkdirSync(out, { recursive: true });
const final = resolve(out, `${id}.mp4`), poster = resolve(out, `${id}.jpg`);
if (force || !existsSync(final)) {
  const s = JSON.parse(readFileSync(scriptFile, 'utf8'));
  const timing = JSON.parse(readFileSync(resolve(here, 'public', `${id}.timing.json`), 'utf8'));
  writeFileSync(resolve(here, `.props-${id}.json`), JSON.stringify({ id, title: s.title, scenes: s.scenes, sets: s.sets || [], cast: s.cast || [], timing, audio: `${id}.mp3`, keys: s.keys || [], theme: H % 8, loop: (H >> 3) % 5 }));
  run('npx', ['remotion', 'render', 'src/index.ts', BRAIN ? 'brain' : VSTYLE, `out/${id}.raw.mp4`, `--props=.props-${id}.json`, ...(process.env.CHROME_PATH ? [`--browser-executable=${process.env.CHROME_PATH}`] : []), '--log=error'], { timeout: 1800000 });
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
{ const sf = JSON.parse(readFileSync(scriptFile, 'utf8')); sf.rendered = new Date().toISOString(); writeFileSync(scriptFile, JSON.stringify(sf, null, 2)); }

// ---------- 5. manifest ----------
if (process.env.NO_MANIFEST) { log('done (manifest built later)'); process.exit(0); }
const s = JSON.parse(readFileSync(scriptFile, 'utf8'));
const timing = JSON.parse(readFileSync(resolve(here, 'public', `${id}.timing.json`), 'utf8'));
const quizIdx = Math.max(0, topic.qa.findIndex(q => q.l === 1));
const m = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : { videos: [] };
m.videos = m.videos.filter(v => v.id !== id);
m.videos.push({ id, topic: topicId, ...(lesson ? { lesson: lessonN, lessonTitle: lesson.t } : {}), title: s.title, url: `${BLOB}/${id}.mp4`, poster: `${BLOB}/${id}.jpg`, duration: Math.round(timing.duration), quiz: quizIdx });
m.videos.sort((a, b) => a.topic.localeCompare(b.topic) || (a.lesson ?? -1) - (b.lesson ?? -1)); m.updated = new Date().toISOString();
writeFileSync(MANIFEST, JSON.stringify(m, null, 1) + '\n');
log(`manifest: ${m.videos.length} videos`);
