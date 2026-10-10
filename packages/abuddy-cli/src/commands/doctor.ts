import * as fs from 'node:fs';
import * as path from 'node:path';
import { packFeatures } from '@abuddy/sdk/build';
import { findPackRoot, readManifest } from '../utils';

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

  console.log('\n  Pack health check\n');

  check('Manifest exists and parses', () => {
    readManifest(root);
    return 'pass';
  });

  const manifest = readManifest(root);

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
    const missing: string[] = [];
    for (const f of packFeatures(manifest)) {
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

  check('Step files present', () => {
    const missing: string[] = [];
    for (const [type, entry] of Object.entries(manifest.steps ?? {})) {
      const targets = [entry.build, entry.trigger?.facet, entry.trigger?.register, entry.runtime?.handler, entry.fe];
      for (const target of targets) {
        if (target && !fs.existsSync(path.join(root, target.split('#')[0]!))) missing.push(`${type} (${target})`);
      }
    }
    if (missing.length) return `missing: ${missing.join(', ')}`;
    return 'pass';
  });

  console.log('');
}
