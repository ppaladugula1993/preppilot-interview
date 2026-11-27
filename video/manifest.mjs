// Builds web/content/videos.json from every finished script in video/topics (videos are in Blob storage).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
const BLOB = 'https://ppvideos7k2.blob.core.windows.net/videos';
const packs = {};
for (const f of readdirSync('../web/content/packs').filter(f => f.endsWith('.json') && f !== 'index.json'))
  for (const t of JSON.parse(readFileSync(`../web/content/packs/${f}`, 'utf8')).topics || []) packs[t.id] = t;
const videos = [];
for (const f of readdirSync('topics').filter(f => f.endsWith('.json'))) {
  const id = f.replace(/\.json$/, ''); const s = JSON.parse(readFileSync(`topics/${f}`, 'utf8'));
  if (!existsSync(`public/${id}.timing.json`) || !s.rendered) continue;
  const m = id.match(/^(.*)-l(\d+)$/); const topic = m ? m[1] : id, lesson = m ? Number(m[2]) : null, t = packs[topic];
  if (!t) continue;
  const dur = JSON.parse(readFileSync(`public/${id}.timing.json`, 'utf8')).duration;
  videos.push({ id, topic, ...(lesson !== null ? { lesson, lessonTitle: t.concepts?.[lesson]?.t } : {}), title: s.title, url: `${BLOB}/${id}.mp4`, poster: `${BLOB}/${id}.jpg`, duration: Math.round(dur), quiz: Math.max(0, t.qa.findIndex(q => q.l === 1)) });
}
videos.sort((a, b) => a.topic.localeCompare(b.topic) || (a.lesson ?? -1) - (b.lesson ?? -1));
writeFileSync('../web/content/videos.json', JSON.stringify({ updated: new Date().toISOString(), videos }, null, 1) + '\n');
console.log(`manifest: ${videos.length} videos`);
