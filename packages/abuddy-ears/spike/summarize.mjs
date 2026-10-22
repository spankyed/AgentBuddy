// SPIKE: median (across runs) of each case's median time in ms, per variant, with the ratio to memory
import fs from 'node:fs';
import path from 'node:path';
const dir = path.join(import.meta.dirname, 'results');
const variants = ['memory', 'disk', 'disk-cache', 'disk-nosync', 'disk-nosync-cache', 'disk-nosync-noindex'];
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const table = {};
for (const v of variants) {
  for (let i = 1; i <= 3; i++) {
    const f = path.join(dir, `${v}-${i}.json`);
    if (!fs.existsSync(f)) continue;
    for (const g of JSON.parse(fs.readFileSync(f, 'utf8')).files[0].groups)
      for (const b of g.benchmarks) ((table[b.name] ??= {})[v] ??= []).push(b.median);
  }
}
const fmt = (ms) => ms >= 100 ? ms.toFixed(0) : ms >= 1 ? ms.toFixed(2) : ms.toFixed(4);
const header = ['case', ...variants];
const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
for (const [name, row] of Object.entries(table)) {
  const mem = row.memory ? med(row.memory) : undefined;
  lines.push(`| ${name} | ${variants.map((v) => {
    if (!row[v]) return '';
    const m = med(row[v]);
    return v === 'memory' || !mem ? `${fmt(m)} ms` : `${fmt(m)} ms (${(m / mem).toFixed(1)}x)`;
  }).join(' | ')} |`);
}
console.log(lines.join('\n'));
for (const v of variants) {
  const f = path.join(dir, `${v}-1.log`);
  if (fs.existsSync(f)) console.log(v, (fs.readFileSync(f, 'utf8').match(/\[bench [^\]]+\][^\n]*/) ?? [''])[0]);
}
