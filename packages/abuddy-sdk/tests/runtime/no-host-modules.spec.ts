// The SDK reaches the app only through the bound HostRuntime: the string-keyed host module registry is gone, and
// nothing in the repo's code brings it back
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '../../../..');
const THIS_FILE = path.relative(ROOT, import.meta.filename);
/** Guards that name the registry only to check it's gone */
const GUARDS = new Set([THIS_FILE, 'packages/abuddy-host/tests/removed-names-in-docs.spec.ts']);
const SKIPPED_DIRS = new Set(['node_modules', 'dist', '.temp', '.git', '__generated__', 'screenshots', 'test-results', 'coverage', '.abuddy']);
const CODE = /\.(?:[cm]?[jt]sx?|vue)$/;
const REGISTRY = /\b(?:registerHostModule|getHostModule|hostFn|hostValue)\b/;

/** Code files under `dir`, relative to the repo root */
function codeFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : codeFiles(full);
    return CODE.test(entry.name) ? [path.relative(ROOT, full)] : [];
  });
}

/** Files naming the host module registry */
function findHostModuleRegistry(root: string, files: string[]): string[] {
  return files.filter((file) => REGISTRY.test(fs.readFileSync(path.join(root, file), 'utf-8')));
}

describe('the host module registry', () => {
  it('is named by no code in the repo', () => {
    const files = [...codeFiles(path.join(ROOT, 'packages')), ...codeFiles(path.join(ROOT, 'scripts')), ...codeFiles(path.join(ROOT, 'tests'))]
      .filter((file) => !GUARDS.has(file));
    expect(files.length).toBeGreaterThan(500);
    expect(findHostModuleRegistry(ROOT, files)).toEqual([]);
  });
});
