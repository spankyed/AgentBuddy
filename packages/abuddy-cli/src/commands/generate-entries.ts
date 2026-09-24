import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import type { PackManifest, PackTypeManifest, PackSnapshot } from '@abuddy/sdk/build';
import { _depTypesFile, _depTypesVersion, generatePackFiles } from '@abuddy/sdk/build';
import { holdExclusiveLock } from '@abuddy/host/exclusive-lock';
import { findPackRoot, readValidManifest, sdkPackageDir, sdkVersion } from '../utils';
import { resolveDeps } from './generate';

const HASH_FILE = '.inputs-hash';
// Hash the codegen implementation too, so SDK upgrades regenerate entries
function codegenSource(): string {
  const sdkDir = sdkPackageDir();
  // Workspace source, then the published compiled output
  for (const file of ['src/build/generate-entries.ts', 'dist/build/generate-entries.js']) {
    const candidate = path.join(sdkDir, file);
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf-8');
  }
  return sdkVersion() ?? '';
}

/**
 * Pack sources codegen reads besides the manifest: service export shapes, step build.ts /
 * index.ts / types.ts, which *-fe.ts and export-types.ts files exist, and so on. Hashing all
 * of src/ (not __generated__) is simpler than tracking each read and never misses one.
 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === '__generated__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|js|mjs|vue|json)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function computeInputsHash(root: string, depSnapshots: Map<string, PackSnapshot>): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(path.join(root, 'abuddy.json'), 'utf-8'));
  hash.update(codegenSource());
  const srcDir = path.join(root, 'src');
  for (const file of fs.existsSync(srcDir) ? sourceFiles(srcDir) : []) {
    hash.update(path.relative(root, file));
    hash.update(fs.readFileSync(file));
  }
  // Generated flow helpers and types depend on every resolved dependency, wherever it came from
  for (const depId of [...depSnapshots.keys()].sort()) {
    hash.update(depId);
    hash.update(JSON.stringify(depSnapshots.get(depId)));
  }
  return hash.digest('hex');
}

/**
 * Warns about each dependency whose facade types (src/__generated__/deps/<id>.d.ts) were generated
 * from a version other than the one the pack builds and runs with.
 */
export function warnStaleDepTypes(root: string, runtimeVersions: Map<string, string>): void {
  for (const [depId, runtimeVersion] of runtimeVersions) {
    const file = path.join(root, _depTypesFile(depId));
    if (!fs.existsSync(file)) continue;
    const typesVersion = _depTypesVersion(fs.readFileSync(file, 'utf-8'), depId);
    if (typesVersion === runtimeVersion) continue;
    console.warn(`\nWarning: ${_depTypesFile(depId)} has the types of ${depId}@${typesVersion ?? 'an unknown version'}, but the pack builds with ${depId}@${runtimeVersion}. Code checked against these types may not match the dependency at runtime: run "abuddy generate-entries --force" (or build without --skip-generate).`);
  }
}

export async function generateEntries(
  _args: string[],
  packRoot?: string,
  depTypes?: Map<string, PackTypeManifest>,
  depSnapshots?: Map<string, PackSnapshot>,
) {
  const root = packRoot ?? findPackRoot(process.cwd());
  const outDir = path.join(root, 'src/__generated__');
  const hashPath = path.join(outDir, HASH_FILE);
  const force = _args.includes('--force');
  // Code generated from a manifest the installer would reject would describe a pack that can't install
  const manifest = readValidManifest(root);

  if (!depSnapshots) {
    const resolved = await resolveDeps(root, manifest.dependencies);
    depTypes = resolved.depTypes;
    depSnapshots = resolved.depSnapshots;
  }
  const currentHash = computeInputsHash(root, depSnapshots);

  if (!force && fs.existsSync(hashPath)) {
    const storedHash = fs.readFileSync(hashPath, 'utf-8').trim();
    if (storedHash === currentHash) {
      console.log('generate-entries: inputs unchanged, skipping (use --force to regenerate)');
      return;
    }
  }

  fs.mkdirSync(outDir, { recursive: true });

  // One writer per pack. Two runs over one pack interleave their writes into `src/__generated__/`, and the loser
  // is invisible: every file is written, the last writer wins each one, and the result reads as a stale build
  // nobody can reproduce. It happened here — concurrent runs left the type barrel describing a fix that was
  // already compiled. The build takes this through this function too, and never around it: `holdExclusiveLock` has no re-entrancy, so a nested take would refuse itself, naming this pid.
  const lock = holdExclusiveLock({
    file: path.join(outDir, GENERATE_LOCK),
    what: 'abuddy generate-entries',
    refuse: (holder) => new Error(
      `Another run is generating ${path.relative(process.cwd(), outDir) || 'src/__generated__'}: ${holder}. `
      + `Wait for it to finish. If none is running, delete ${path.join(outDir, GENERATE_LOCK)} and try again.`,
    ),
  });
  try {
    writeGenerated(root, outDir, hashPath, currentHash, manifest, depTypes, depSnapshots);
  } finally {
    lock.release();
  }
}

/** The lock file, inside the directory it guards, so it travels with the output it protects */
const GENERATE_LOCK = '.generating.lock';

function writeGenerated(
  root: string,
  outDir: string,
  hashPath: string,
  currentHash: string,
  manifest: PackManifest,
  depTypes: Map<string, PackTypeManifest> | undefined,
  depSnapshots: Map<string, PackSnapshot>,
) {
  const files = generatePackFiles(manifest, { packRoot: root, depTypes, depSnapshots });

  // Dependencies' facade types are rewritten from their snapshots each time
  fs.rmSync(path.join(outDir, 'deps'), { recursive: true, force: true });
  for (const [filePath, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, filePath)), { recursive: true });
    fs.writeFileSync(path.join(root, filePath), content);
  }
  // Generated files this codegen no longer emits (renamed or removed outputs) would keep
  // compiling into the pack with stale content; hand-written files are never touched
  const produced = new Set(Object.keys(files).map(f => path.resolve(root, f)));
  for (const name of fs.readdirSync(outDir)) {
    if (name === GENERATE_LOCK) continue;
    const file = path.join(outDir, name);
    if (produced.has(file) || name === HASH_FILE || !fs.statSync(file).isFile()) continue;
    const head = fs.readFileSync(file, 'utf-8').slice(0, 120);
    if (/^\/\/ (@generated from abuddy\.json|Auto-generated by `abuddy generate-entries`)/.test(head)) fs.rmSync(file);
  }

  fs.writeFileSync(hashPath, currentHash + '\n');

  console.log('Generated:');
  for (const filePath of Object.keys(files)) {
    console.log(`  ${filePath}`);
  }
}

/**
 * Regenerates the entries after `abuddy add` wrote new files. Reading a system's events takes the pack's `@abuddy/sdk`,
 * which a pack scaffolded moments ago may not have installed yet: then the scaffold stands, and the pack's `prepare`
 * script regenerates the entries when `npm install` runs.
 */
export async function regenerateAfterScaffold(root: string): Promise<boolean> {
  try {
    await generateEntries([], root);
    return true;
  } catch (err) {
    // A pack scaffolded before `npm install` can't resolve what its contracts name, and nothing here can tell
    // that from a mistake in the pack: both reach the reader as a type that didn't resolve. So say what happened
    // and let `npm install`, which regenerates, be the next step either way.
    console.log(`\n  src/__generated__/ not regenerated: ${(err as Error).message}. Run: npm install (it regenerates them)`);
    return false;
  }
}
