import { _parseModuleReference, findSourceModule, SCRIPT_MODULE_EXTENSIONS, validateFeatures } from '@apackdev/sdk/build';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseManifest, MIGRATION_LINES } from '@apackdev/sdk/build';
import { findPackRoot, readManifest } from '../utils';

type Status = 'pass' | 'warn' | 'fail';

function reportCheck(label: string, fn: () => Status | string): boolean {
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
    return status !== 'fail';
  } catch (err) {
    console.log(`  \x1b[31m✗\x1b[0m ${label} — ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

export async function doctor(args: string[]) {
  if (args.length) throw new Error('Usage: apack pack doctor');
  const root = findPackRoot(process.cwd());
  let failures = 0;
  const check = (label: string, fn: () => Status | string) => { if (!reportCheck(label, fn)) failures++; };

  console.log('\n  Pack health check\n');

  let manifest: ReturnType<typeof readManifest> | undefined;
  check('Manifest exists and parses', () => {
    manifest = readManifest(root);
    return 'pass';
  });

  if (!manifest) throw new Error('Pack health check failed: invalid manifest.');
  const parsed = manifest;

  check('Manifest is valid', () => parseManifest(parsed).diagnostics.map(issue => issue.message).join('; ') || 'pass');

  check('Generated files exist', () => {
    const genDir = path.join(root, 'src', '__generated__');
    if (!fs.existsSync(genDir)) return 'warn';
    return 'pass';
  });

  check('Feature files present', () => validateFeatures(root, parsed).diagnostics.map(issue => issue.message).join('; ') || 'pass');

  check('Step files present', () => {
    const missing: string[] = [];
    for (const [type, entry] of Object.entries(parsed.extensions?.steps ?? {})) {
      const targets = [entry.node, entry.build, entry.trigger?.facet, entry.trigger?.register, entry.runtime?.handler, entry.fe];
      for (const target of targets) {
        if (target && !findSourceModule(root, _parseModuleReference(target, `Step "${type}"`, 'default').source, SCRIPT_MODULE_EXTENSIONS, `Step "${type}"`)) missing.push(`${type} (${target})`);
      }
    }
    if (missing.length) return `missing: ${missing.join(', ')}`;
    return 'pass';
  });

  check('Migration files present', () => {
    // Both lines: a file missing under either is a migration that cannot run, and reading one map would
    // report `pass` over a pack whose migrations are all declared on the other
    const missing = MIGRATION_LINES.flatMap((line) => Object.entries(parsed.migrations?.[line] ?? {})
      .filter(([version, target]) => !findSourceModule(root, _parseModuleReference(target.up, `Migration ${line}/${version}`).source, SCRIPT_MODULE_EXTENSIONS, `Migration ${line}/${version}`))
      .map(([version, target]) => `${line}/${version} (${target.up})`));
    if (missing.length) return `missing: ${missing.join(', ')}`;
    return 'pass';
  });

  console.log('');
  if (failures) throw new Error(`Pack health check failed: ${failures} check(s).`);
}
