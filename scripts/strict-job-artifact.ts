/**
 * What the strict gate's `producers` job hands to the jobs after it, one repo-relative path per line.
 *
 *     tsx scripts/strict-job-artifact.ts > producers.list
 *
 * A consumer replays recorded build inputs, which name every file and directory listing a build looked at,
 * so the handoff is the producers' whole tree beyond the checkout and the dependency install, not only the
 * steps' declared outputs: every git-ignored path the job created (builds, `.temp`, `.apack`, generated
 * entries), minus the `node_modules` trees `npm ci` rebuilds identically, plus the caches inside those that
 * the job wrote — the chain's and the packages' stamps, which make `--only` accept the outputs as current,
 * and the typecheck legs' build infos, which `dep-files.integration.spec.ts` reads.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { STAMP_DIR } from './lib/chain-stamps.ts';
import { DEP_FILE_DIR } from './lib/dep-files.ts';
import { PACKAGE_DIRS } from './lib/workspace-deps.ts';

const relative = (file: string) => path.relative(REPO_ROOT, file).split(path.sep).join('/');
const ignored = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'],
  { cwd: REPO_ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
  .map((entry) => entry.replace(/\/$/, ''))
  .filter((entry) => !entry.split('/').includes('node_modules'));
// The chain's stamps, without its per-run evidence directories and lock
const chainStamps = fs.existsSync(STAMP_DIR)
  ? fs.readdirSync(STAMP_DIR).filter((name) => name.endsWith('.json')).map((name) => relative(path.join(STAMP_DIR, name)))
  : [];
const caches = [
  relative(path.join(REPO_ROOT, 'node_modules', '.cache', 'apack-packages-build')),
  relative(DEP_FILE_DIR),
  // vue-tsc's build infos, which a tsconfig places under its package's own node_modules (`tsBuildInfoFile`)
  ...PACKAGE_DIRS.map((dir) => `packages/${dir}/node_modules/.tmp`),
];
const paths = [...ignored, ...chainStamps, ...caches].filter((file) => fs.existsSync(path.join(REPO_ROOT, file)));
process.stdout.write(`${[...new Set(paths)].sort().join('\n')}\n`);
