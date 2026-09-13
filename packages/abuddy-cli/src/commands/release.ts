import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as semver from 'semver';
import { Octokit } from '@octokit/rest';
import { findPackRoot, readManifest } from '../utils';
import { parseManifest } from '@abuddy/sdk/build';
import { resolveDeps } from './generate';
import { build } from './build';
import { packBundle } from './pack';
import { bundleArchiveName, readBundleInfo, verifyBundle, extractBundleArchive } from '@abuddy/sdk/packs';

const HELP = `
Usage:
  abuddy release [patch|minor|major] [--beta] [--dry-run] [--local] [--skip-tests] [--skip-e2e]
  abuddy release publish [--dir <dir>] [--dry-run]

release   Preflight, bump the version (beta cycle: 1.2.3 → 1.2.4-beta.0 → -beta.1 → 1.2.4),
          build --release, typecheck, unit tests, E2E, pack, then commit, tag v<version>
          and push. The pack's .github/workflows/release.yml publishes the GitHub release
          from the tag. With --local, publishes from this machine instead.
          --dry-run changes nothing: no file edits, git operations or publishing; it
          produces and verifies the bundle for the next version under .abuddy/release/.

publish   Create the GitHub release for the bundle in <dir> (default .abuddy/release)
          and upload <id>-<version>.tgz and .sha256. Used by the release workflow.
          Needs GITHUB_TOKEN (or GH_TOKEN) and GITHUB_REPOSITORY or an origin remote.
`.trim();

export type BumpType = 'patch' | 'minor' | 'major';

/** Same version cycle as the AgentBuddy app release (build/release/release.sh). */
export function nextReleaseVersion(current: string, bump: BumpType, beta: boolean): string {
  const valid = semver.valid(current);
  if (!valid) throw new Error(`Current version "${current}" is not valid semver`);
  const isPrerelease = semver.prerelease(valid) !== null;
  const next = beta
    ? (isPrerelease ? semver.inc(valid, 'prerelease', 'beta') : semver.inc(valid, `pre${bump}`, 'beta'))
    : semver.inc(valid, bump);
  if (!next) throw new Error(`Could not bump ${current}`);
  return next;
}

export type Runner = (cmd: string, args: string[], cwd: string) => string;

export const defaultRunner: Runner = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();

export interface PreflightResult {
  errors: string[];
  warnings: string[];
}

export async function preflight(root: string, options: { local: boolean; run: Runner; env?: NodeJS.ProcessEnv }): Promise<PreflightResult> {
  const env = options.env ?? process.env;
  const errors: string[] = [];
  const warnings: string[] = [];
  const git = (...args: string[]) => options.run('git', args, root);

  const raw = JSON.parse(fs.readFileSync(path.join(root, 'abuddy.json'), 'utf-8'));
  const { errors: manifestErrors } = parseManifest(raw);
  errors.push(...manifestErrors.map(e => `abuddy.json: ${e}`));
  if (!raw.hostVersion) errors.push('abuddy.json: hostVersion is required for releases (e.g. ">=0.3.0")');

  try {
    await resolveDeps(root, raw.dependencies);
  } catch (err) {
    errors.push(`dependencies: ${err instanceof Error ? err.message : String(err)}`);
  }

  let inRepo = true;
  try { git('rev-parse', '--is-inside-work-tree'); } catch { inRepo = false; }
  if (!inRepo) {
    errors.push('not a git repository');
  } else {
    if (git('status', '--porcelain')) errors.push('working tree has uncommitted changes');
    let branch = '';
    try { branch = git('rev-parse', '--abbrev-ref', 'HEAD'); } catch {}
    let defaultBranch = '';
    try { defaultBranch = git('symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^origin\//, ''); } catch {}
    if (defaultBranch && branch !== defaultBranch) {
      errors.push(`on branch "${branch}"; releases are cut from "${defaultBranch}"`);
    } else if (!defaultBranch && !['main', 'master'].includes(branch)) {
      errors.push(`on branch "${branch}"; releases are cut from the default branch`);
    }
    try { git('remote', 'get-url', 'origin'); } catch { errors.push('no "origin" remote to push the release tag to'); }
  }

  const hasWorkflow = fs.existsSync(path.join(root, '.github', 'workflows', 'release.yml'));
  if (options.local && !(env.GITHUB_TOKEN || env.GH_TOKEN)) {
    errors.push('--local publishing needs GITHUB_TOKEN or GH_TOKEN');
  }
  if (options.local && hasWorkflow) {
    // The pushed tag triggers the workflow, so publishing locally too would create the release twice
    errors.push('--local publishes from this machine, but .github/workflows/release.yml also publishes when the tag is pushed; release without --local, or remove the workflow');
  }
  if (!options.local && !hasWorkflow) {
    warnings.push('no .github/workflows/release.yml — pushing the tag will not publish anything (use --local, or run "abuddy init" to scaffold the workflow)');
  }
  return { errors, warnings };
}

function writeVersion(root: string, version: string): string[] {
  const changed: string[] = [];
  for (const file of ['abuddy.json', 'package.json']) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    const json = JSON.parse(fs.readFileSync(p, 'utf-8'));
    json.version = version;
    fs.writeFileSync(p, JSON.stringify(json, null, 2) + '\n');
    changed.push(file);
  }
  return changed;
}

function hasScript(root: string, name: string): boolean {
  try {
    return Boolean(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8')).scripts?.[name]);
  } catch {
    return false;
  }
}

async function verify(root: string, options: { skipTests: boolean; skipE2e: boolean; run: Runner }): Promise<void> {
  console.log('\nBuilding (release)...');
  process.exitCode = 0;
  await build(['--release']);
  if (process.exitCode) throw new Error('Release build failed');

  if (fs.existsSync(path.join(root, 'tsconfig.json'))) {
    console.log('Typechecking...');
    options.run('npx', ['--no-install', 'tsc', '--noEmit'], root);
  }
  if (!options.skipTests && hasScript(root, 'test')) {
    console.log('Running unit tests...');
    options.run('npm', ['test', '--silent'], root);
  }
  if (!options.skipE2e && fs.existsSync(path.join(root, 'playwright.config.ts'))) {
    console.log('Running E2E tests...');
    const { test } = await import('./test');
    await test([]);
    if (process.exitCode) throw new Error('E2E tests failed');
  }
}

export function resolveRepository(root: string, env: NodeJS.ProcessEnv, run: Runner): { owner: string; repo: string } {
  const slug = env.GITHUB_REPOSITORY ?? (() => {
    const url = run('git', ['remote', 'get-url', 'origin'], root);
    const m = url.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/);
    if (!m) throw new Error(`origin remote is not a GitHub repository: ${url}`);
    return `${m[1]}/${m[2]}`;
  })();
  const [owner, repo] = slug.split('/');
  if (!owner || !repo) throw new Error(`Invalid repository "${slug}"`);
  return { owner, repo };
}

export interface PublishOptions {
  dryRun?: boolean;
  env?: NodeJS.ProcessEnv;
  run?: Runner;
  /** Injected for tests; defaults to an authenticated Octokit. */
  octokit?: Pick<Octokit, 'rest'>;
}

/** Create the GitHub release for a packed bundle and upload the archive + checksum. */
export async function publishRelease(root: string, releaseDir: string, options: PublishOptions = {}): Promise<{ tag: string; prerelease: boolean }> {
  const env = options.env ?? process.env;
  const run = options.run ?? defaultRunner;
  const manifest = readManifest(root);
  const version = manifest.version;
  const archive = path.join(releaseDir, bundleArchiveName(manifest.id, version));
  const checksumFile = `${archive}.sha256`;
  if (!fs.existsSync(archive) || !fs.existsSync(checksumFile)) {
    throw new Error(`No ${path.basename(archive)} (+ .sha256) in ${releaseDir}. Run "abuddy pack --out ${releaseDir}" first.`);
  }

  // Refuse to publish anything that doesn't verify
  const sha256 = fs.readFileSync(checksumFile, 'utf-8').trim().split(/\s+/)[0];
  const scratch = fs.mkdtempSync(path.join(releaseDir, '.verify-'));
  try {
    const extracted = await extractBundleArchive(archive, scratch, sha256);
    const info = verifyBundle(extracted);
    if (info.version !== version) throw new Error(`Bundle version ${info.version} does not match abuddy.json ${version}`);
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  const tag = `v${version}`;
  const prerelease = semver.prerelease(version) !== null;
  const { owner, repo } = resolveRepository(root, env, run);

  if (options.dryRun) {
    console.log(`[dry-run] Would create GitHub release ${owner}/${repo}@${tag}${prerelease ? ' (prerelease)' : ''} with ${path.basename(archive)} and ${path.basename(checksumFile)}`);
    return { tag, prerelease };
  }

  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (!token && !options.octokit) throw new Error('GITHUB_TOKEN (or GH_TOKEN) is required to publish');
  const octokit = options.octokit ?? new Octokit({ auth: token, userAgent: 'abuddy-cli' });

  const { data: release } = await octokit.rest.repos.createRelease({
    owner,
    repo,
    tag_name: tag,
    name: `${manifest.name} ${tag}`,
    prerelease,
    generate_release_notes: true,
  });
  for (const file of [archive, checksumFile]) {
    await octokit.rest.repos.uploadReleaseAsset({
      owner,
      repo,
      release_id: release.id,
      name: path.basename(file),
      data: fs.readFileSync(file) as unknown as string,
      headers: { 'content-type': file.endsWith('.tgz') ? 'application/gzip' : 'text/plain' },
    });
  }
  console.log(`Published ${owner}/${repo}@${tag}${prerelease ? ' (prerelease)' : ''}`);
  return { tag, prerelease };
}

export interface ReleaseOptions {
  bump: BumpType;
  beta: boolean;
  dryRun: boolean;
  local: boolean;
  skipTests: boolean;
  skipE2e: boolean;
  run?: Runner;
  env?: NodeJS.ProcessEnv;
}

export async function runRelease(root: string, options: ReleaseOptions): Promise<{ version: string; archive: string }> {
  const run = options.run ?? defaultRunner;
  const env = options.env ?? process.env;
  const manifest = readManifest(root);
  const version = nextReleaseVersion(manifest.version, options.bump, options.beta);
  console.log(`Releasing ${manifest.id}: ${manifest.version} → ${version}${options.dryRun ? ' (dry run)' : ''}`);

  const { errors, warnings } = await preflight(root, { local: options.local, run, env });
  for (const w of warnings) console.warn(`  ! ${w}`);
  if (errors.length > 0) {
    const report = errors.map(e => `  - ${e}`).join('\n');
    if (!options.dryRun) throw new Error(`Release preflight failed:\n${report}`);
    console.warn(`Preflight problems (a real release would stop here):\n${report}`);
  }

  if (!options.dryRun) writeVersion(root, version);
  try {
    await verify(root, { skipTests: options.skipTests, skipE2e: options.skipE2e, run });
  } catch (err) {
    if (!options.dryRun) console.error(`Verification failed; version files were bumped to ${version} — revert them before retrying.`);
    throw err;
  }

  const releaseDir = path.join(root, '.abuddy', 'release');
  fs.rmSync(releaseDir, { recursive: true, force: true });
  const packed = await packBundle(root, releaseDir, { version });
  console.log(`\nBundle: ${packed.file}\n  sha256: ${packed.sha256}\n  files: ${Object.keys(readBundleInfo(path.join(root, '.abuddy', 'bundle', manifest.id)).files).length}`);

  if (options.dryRun) {
    console.log(`\n[dry-run] Would commit version files, tag v${version} and push${options.local ? ', then publish the GitHub release locally' : ' (the release workflow publishes from the tag)'}.`);
    return { version, archive: packed.file };
  }

  const git = (...args: string[]) => run('git', args, root);
  git('add', 'abuddy.json', ...(fs.existsSync(path.join(root, 'package.json')) ? ['package.json'] : []));
  git('commit', '-m', `release: v${version}`);
  git('tag', '-a', `v${version}`, '-m', `v${version}`);
  git('push', '--follow-tags', 'origin', 'HEAD');

  if (options.local) {
    await publishRelease(root, releaseDir, { env, run });
  } else {
    console.log(`\nPushed v${version}. The release workflow will build and publish it.`);
  }
  return { version, archive: packed.file };
}

export async function release(args: string[]) {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }
  const root = findPackRoot(process.cwd());

  if (args[0] === 'publish') {
    const dirIdx = args.indexOf('--dir');
    const dir = dirIdx >= 0 && args[dirIdx + 1] ? path.resolve(args[dirIdx + 1]) : path.join(root, '.abuddy', 'release');
    await publishRelease(root, dir, { dryRun: args.includes('--dry-run') });
    return;
  }

  const bump = (['patch', 'minor', 'major'] as const).find(b => args.includes(b)) ?? 'patch';
  await runRelease(root, {
    bump,
    beta: args.includes('--beta'),
    dryRun: args.includes('--dry-run'),
    local: args.includes('--local'),
    skipTests: args.includes('--skip-tests'),
    skipE2e: args.includes('--skip-e2e'),
  });
}
