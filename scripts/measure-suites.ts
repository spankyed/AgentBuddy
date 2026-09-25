/**
 * Each unit suite run alone: its work (the sum of its files' times), its floor (its slowest single file)
 * and its file count.
 *
 *     npx tsx scripts/measure-suites.ts
 *
 * Alone and serially on purpose. Both numbers are about one suite's own shape, and a suite measured beside
 * another is measuring the machine — contention has produced a wrong answer here more than once. The floor
 * is what bounds a run however the work is scheduled, so `max(floor, work/cores)` is the target any change
 * to scheduling is measured against.
 *
 * It parses the runner's own per-file lines rather than adding a reporter, for the reason
 * `scripts/lib/slow-tests.ts` gives: it keeps working when the suites are run some other way.
 */
import { execFileSync } from 'node:child_process';
import { UNIT_SUITES } from './lib/unit-suites.ts';

const ANSI = /\u001B\[[0-9;]*m/g;
const FILE = /^\s*[✓×↓]\s+(\S+\.(?:spec|test)\.ts)\s+\([^)]*\)\s+([\d.]+)(ms|s)\b/;

const rows: { suite: string; work: number; floor: number; floorFile: string; files: number }[] = [];
for (const suite of UNIT_SUITES) {
  let out = '';
  const started = Date.now();
  try {
    out = execFileSync('npm', ['test', '-w', suite.workspace], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  } catch (err) {
    out = String((err as { stdout?: string }).stdout ?? '');
  }
  const wall = Date.now() - started;
  const files: { name: string; ms: number }[] = [];
  for (const raw of out.replace(ANSI, '').split('\n')) {
    const m = FILE.exec(raw);
    if (m) files.push({ name: m[1], ms: m[3] === 's' ? Number(m[2]) * 1000 : Number(m[2]) });
  }
  const work = files.reduce((sum, f) => sum + f.ms, 0);
  const slowest = files.reduce((best, f) => (f.ms > best.ms ? f : best), { name: '-', ms: 0 });
  rows.push({ suite: suite.workspace, work, floor: slowest.ms, floorFile: slowest.name, files: files.length });
  console.error(`  ${suite.workspace} done (${(wall / 1000).toFixed(1)}s wall)`);
}

rows.sort((a, b) => b.work - a.work);
const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
console.log('\n| suite | work | floor | files | floor file |');
console.log('|---|---|---|---|---|');
for (const r of rows) console.log(`| \`${r.suite}\` | ${s(r.work)} | **${s(r.floor)}** | ${r.files} | ${r.floorFile} |`);
console.log(`\ntotal work ${s(rows.reduce((t, r) => t + r.work, 0))}, max floor ${s(Math.max(...rows.map((r) => r.floor)))}`);
