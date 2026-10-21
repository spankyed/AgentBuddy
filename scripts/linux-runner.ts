// Runs a command in the Linux test container, from a Mac: `npm run test:linux -- <command>`.
//
// The compiler-runtime, native-fixture and live-watcher suites do not run directly on a daily-use Mac
// (`compilerTestsRunHere`, @apackdev/host/build/compiler-test-host). Linux runs them the way CI's Linux jobs do,
// so this is the local route to them, and `npm run chain` sends its steps that need it here.
//
// The checkout is mounted read-only and copied into a persistent volume, because the container needs its own
// `node_modules` (the Mac's holds macOS binaries) and its own package builds, and because the suites' live
// watchers want an ordinary Linux filesystem rather than a bind mount. Only the first run pays for `npm ci`;
// later runs copy what changed. The command's exit code and output pass straight through.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';

const DOCKERFILE = path.join(REPO_ROOT, 'scripts', 'linux', 'Dockerfile');
const short = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex').slice(0, 12);
/** Keyed by the Dockerfile's bytes, so an edit builds a new image rather than reusing a stale one */
const IMAGE = `apack-linux-test:${short(fs.readFileSync(DOCKERFILE))}`;
/** One working copy per checkout, so two worktrees never share a container `node_modules` */
const WORK_VOLUME = `apack-linux-work-${short(REPO_ROOT)}`;
const NPM_CACHE_VOLUME = 'apack-linux-npm-cache';

/**
 * What the copy carries and leaves out, as rsync filters in order. Every `node_modules` stays out (the container
 * installs its own), except the typecheck legs' build infos — `node_modules/.cache/tsbuildinfo` and the renderer's
 * `node_modules/.tmp`: the Mac's legs write them, the integration specs read them, and they hold relative paths.
 * Everything else the Mac's steps produced is carried too — build outputs, `.apack` build records — because the
 * suites read them. Also out: the package builds `packages:ensure` owns, which the container makes for itself.
 * Excluded paths in the volume survive each copy, so the container's own installs and builds are kept.
 */
const FILTERS = [
  '--include=/node_modules/', '--include=/node_modules/.cache/', '--include=/node_modules/.cache/tsbuildinfo/***',
  '--exclude=/node_modules/.cache/*', '--exclude=/node_modules/*',
  '--include=/packages/renderer/node_modules/', '--include=/packages/renderer/node_modules/.tmp/***',
  '--exclude=/packages/renderer/node_modules/*',
  '--exclude=node_modules',
  ...['apack-ears', 'apack-sdk', 'apack-ui', 'apack-testing', 'apack-cli'].flatMap((pkg) =>
    [`--exclude=/packages/${pkg}/dist`, `--exclude=/packages/${pkg}/publish`]),
];

const docker = (args: string[], stdio: 'inherit' | 'pipe' = 'pipe') => spawnSync('docker', args, { stdio, encoding: 'utf8' });

function refuse(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const command = process.argv.slice(2);
if (command.length === 0) refuse('usage: npm run test:linux -- <command> [args...]');

if (docker(['info']).status !== 0) {
  refuse('This runs in the Linux test container, and Docker is not running. Start it (OrbStack: `orb start`) and run again.');
}

if (docker(['image', 'inspect', IMAGE]).status !== 0) {
  process.stderr.write(`Building the Linux test image ${IMAGE} (once per Dockerfile change)…\n`);
  if (docker(['build', '-t', IMAGE, '-f', DOCKERFILE, path.dirname(DOCKERFILE)], 'inherit').status !== 0) {
    refuse(`Building ${IMAGE} failed; its output is above.`);
  }
}

/**
 * A linked worktree's `.git` is a file naming the repository's git dir by absolute path. Mounting that dir at the
 * same path lets git resolve it inside the container, so specs that ask git about this checkout still can.
 */
function gitDirMount(): string[] {
  const dotGit = path.join(REPO_ROOT, '.git');
  if (!fs.statSync(dotGit).isFile()) return [];
  const gitDir = /^gitdir: (.+)$/m.exec(fs.readFileSync(dotGit, 'utf8'))?.[1]?.trim();
  if (gitDir === undefined) return [];
  const common = path.resolve(gitDir, fs.readFileSync(path.join(gitDir, 'commondir'), 'utf8').trim());
  return ['-v', `${common}:${common}:ro`];
}

/** What the chain and its pools tell a step about the run it is part of */
const forwarded = Object.keys(process.env).filter((key) => key.startsWith('APACK_') || key === 'FORCE_COLOR');

const quote = (arg: string): string => `'${arg.replace(/'/g, `'\\''`)}'`;
/**
 * Copy, then install when the lockfile differs from the one the volume last installed from — under one lock on the
 * volume, because the chain runs two of these steps at once and two copies or two installs into one tree race.
 * The containers share the Linux VM's kernel, so `flock` on a file in the volume holds across them.
 */
const sync = [
  `rsync -a --delete --exclude=/.apack-sync.lock ${FILTERS.map(quote).join(' ')} /src/ /work/`,
  'lock=$(sha256sum package-lock.json | cut -d" " -f1)',
  'if [ "$(cat node_modules/.apack-installed-lock 2>/dev/null)" != "$lock" ]; then',
  '  npm ci --no-audit --no-fund',
  '  echo "$lock" > node_modules/.apack-installed-lock',
  'fi',
].join('\n');
const script = [
  'set -e',
  `flock /work/.apack-sync.lock bash -ec ${quote(sync)}`,
  `exec ${command.map(quote).join(' ')}`,
].join('\n');

const child = spawn('docker', [
  // IPv4 loopback only, as on CI's Linux runners: with IPv6 up, `localhost` resolves to ::1 first here, so a
  // dev server binds where a client dialling 127.0.0.1 cannot reach it
  'run', '--rm', '--init', '--sysctl', 'net.ipv6.conf.all.disable_ipv6=1',
  '-v', `${REPO_ROOT}:/src:ro`, '-v', `${WORK_VOLUME}:/work`, '-v', `${NPM_CACHE_VOLUME}:/root/.npm`,
  ...gitDirMount(),
  ...forwarded.flatMap((key) => ['-e', key]),
  IMAGE, 'bash', '-c', script,
], { stdio: 'inherit' });

// Docker forwards these to the container's init, which stops the command and lets `--rm` clean up
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
child.on('close', (code, signal) => { process.exitCode = code ?? (signal === null ? 1 : 128); });
