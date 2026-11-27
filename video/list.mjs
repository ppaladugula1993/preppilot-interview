// Prints the work list as JSON chunks for the GitHub matrix: every topic overview, then every lesson.
import { readFileSync, readdirSync } from 'node:fs';
const ids = [];
for (const f of readdirSync('../web/content/packs').filter(f => f.endsWith('.json') && f !== 'index.json'))
  for (const t of JSON.parse(readFileSync(`../web/content/packs/${f}`, 'utf8')).topics || []) {
    ids.push(t.id); (t.concepts || []).forEach((_, i) => ids.push(`${t.id}:${i}`));
  }
const n = Number(process.argv[2] || 20), chunks = [];
for (let i = 0; i < ids.length; i += n) chunks.push(ids.slice(i, i + n).join(' '));
console.log(JSON.stringify(chunks));
