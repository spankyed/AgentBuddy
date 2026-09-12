import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findPackRoot, readManifest, sdkVersion } from '../utils';
import { createBundleArchive, stageBundle, verifyBundle, type BundleInfo } from '@abuddy/sdk/packs';

const HELP = `
Usage: abuddy pack [--out <dir>]

Stage the built pack (dist/) into a verified bundle and write
<id>-<version>.tgz plus <id>-<version>.tgz.sha256. Run "abuddy build" first
("abuddy build --release" for publishable output).

Options:
  --out <dir>   Output directory (default: pack root)
`.trim();

function gitSource(root: string): BundleInfo['source'] | undefined {
  const git = (...args: string[]) => {
    try {
      return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || undefined;
    } catch {
      return undefined;
    }
  };
  const commit = git('rev-parse', 'HEAD');
  if (!commit) return undefined;
  return { commit, repo: git('remote', 'get-url', 'origin') };
}

export interface PackResult {
  file: string;
  sha256: string;
  checksumFile: string;
  bundle: BundleInfo;
}

export async function packBundle(root: string, outDir: string, options: { version?: string } = {}): Promise<PackResult> {
  const manifest = readManifest(root);
  if (manifest.builtIn) {
    throw new Error('Built-in packs ship inside the app and are not packed.');
  }
  const stageDir = path.join(root, '.abuddy', 'bundle', manifest.id);
  stageBundle(root, stageDir, {
    sdkVersion: sdkVersion(),
    source: gitSource(root),
    version: options.version,
  });
  const bundle = verifyBundle(stageDir);
  const archive = await createBundleArchive(stageDir, outDir);
  return { ...archive, bundle };
}

export async function pack(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  const root = findPackRoot(process.cwd());
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 && args[outIndex + 1] ? path.resolve(args[outIndex + 1]) : root;

  const result = await packBundle(root, outDir);
  const show = (p: string) => {
    const rel = path.relative(process.cwd(), p);
    return rel.startsWith('..') ? p : rel;
  };
  const sizeKB = (fs.statSync(result.file).size / 1024).toFixed(1);
  const fileCount = Object.keys(result.bundle.files).length;

  console.log(`Packed ${show(result.file)} (${sizeKB} KB, ${fileCount} files)`);
  console.log(`  sha256: ${result.sha256}`);
  console.log(`  checksum: ${show(result.checksumFile)}`);
}
