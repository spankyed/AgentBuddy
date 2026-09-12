import * as fs from 'node:fs';
import * as path from 'node:path';
import { findPackRoot } from '../utils';

type Status = 'pass' | 'warn' | 'fail';

function check(label: string, fn: () => Status | string): void {
  try {
    const result = fn();
    let status: Status;
    let msg = '';
    if (result === 'pass' || result === 'warn' || result === 'fail') {
      status = result;
    } else {
      status = 'fail';
      msg = result;
    }
    const icon = status === 'pass' ? '✓' : status === 'warn' ? '!' : '✗';
    const color = status === 'pass' ? '\x1b[32m' : status === 'warn' ? '\x1b[33m' : '\x1b[31m';
    console.log(`  ${color}${icon}\x1b[0m ${label}${msg ? ` — ${msg}` : ''}`);
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m ${label} — ${err instanceof Error ? err.message : err}`);
  }
}

export async function doctor(_args: string[]) {
  const root = findPackRoot(process.cwd());
  const manifestPath = path.join(root, 'abuddy.json');

  console.log('\n  Pack health check\n');

  check('Manifest exists and parses', () => {
    JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    return 'pass';
  });

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

  check('Manifest has required fields', () => {
    if (!manifest.id) return 'missing "id"';
    if (!manifest.hostVersion) return 'missing "hostVersion"';
    return 'pass';
  });

  check('Generated files exist', () => {
    const genDir = path.join(root, 'src', '__generated__');
    if (!fs.existsSync(genDir)) return 'warn';
    return 'pass';
  });

  check('Feature files present', () => {
    const features = manifest.features || [];
    const missing: string[] = [];
    for (const f of features) {
      if (f.system?.entry && !fs.existsSync(path.join(root, f.system.entry))) {
        missing.push(`${f.id}/system`);
      }
      if (f.plugin?.entry && !fs.existsSync(path.join(root, f.plugin.entry))) {
        missing.push(`${f.id}/plugin`);
      }
    }
    if (missing.length) return `missing: ${missing.join(', ')}`;
    return 'pass';
  });

  check('Step definitions present', () => {
    const defs = manifest.steps?.definitions || [];
    const missing: string[] = [];
    for (const d of defs) {
      if (d.path && !fs.existsSync(path.join(root, d.path))) {
        missing.push(d.type);
      }
    }
    if (missing.length) return `missing: ${missing.join(', ')}`;
    return 'pass';
  });

  console.log('');
}
