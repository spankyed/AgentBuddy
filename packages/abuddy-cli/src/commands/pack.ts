import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findPackRoot, readValidManifest, sdkVersion } from '../utils';
import { createPackArchive, stagePack, verifyPack, type PackIntegrity } from '@abuddy/host/packs';

const HELP = `
Usage: abuddy pack [--out <dir>]

Stage the built pack (dist/) into a verified pack layout and write
<id>-<version>.tgz plus <id>-<version>.tgz.sha256. Run "abuddy build" first
("abuddy build --release" for publishable output).

Options:
  --out <dir>   Output directory (default: pack root)
`.trim();

export function gitSource(root: string): PackIntegrity['source'] | undefined {
  const git = (...args: string[]) => {
    try {
      return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || undefined;
    } catch {
      return undefined;
    }
  };
  const commit = git('rev-parse', 'HEAD');
  if (!commit) return undefined;
  // An https remote can carry credentials (https://user:token@host/…); never publish them
  return { commit, repo: git('remote', 'get-url', 'origin')?.replace(/^(\w+:\/\/)[^@/]+@/, '$1') };
}

export interface PackResult {
  file: string;
  sha256: string;
  checksumFile: string;
  integrity: PackIntegrity;
}

export async function buildPackArchive(root: string, outDir: string, options: { version?: string } = {}): Promise<PackResult> {
  const manifest = readValidManifest(root);
  if (manifest.builtIn) {
    throw new Error('Built-in packs ship inside the app and are not packed.');
  }
  const stageDir = path.join(root, '.abuddy', 'staged', manifest.id);
  stagePack(root, stageDir, {
    sdkVersion: sdkVersion(),
    source: gitSource(root),
    version: options.version,
  });
  const integrity = verifyPack(stageDir);
  const archive = await createPackArchive(stageDir, outDir);
  return { ...archive, integrity };
}

export async function pack(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  const root = findPackRoot(process.cwd());
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 && args[outIndex + 1] ? path.resolve(args[outIndex + 1]) : root;

  const result = await buildPackArchive(root, outDir);
  const show = (p: string) => {
    const rel = path.relative(process.cwd(), p);
    return rel.startsWith('..') ? p : rel;
  };
  const sizeKB = (fs.statSync(result.file).size / 1024).toFixed(1);
  const fileCount = Object.keys(result.integrity.files).length;

  console.log(`Packed ${show(result.file)} (${sizeKB} KB, ${fileCount} files)`);
  console.log(`  sha256: ${result.sha256}`);
  console.log(`  checksum: ${show(result.checksumFile)}`);
}
