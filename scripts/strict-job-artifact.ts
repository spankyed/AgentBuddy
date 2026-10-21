/**
 * What the strict gate's `producers` job hands to the jobs after it, one repo-relative path per line.
 *
 *     tsx scripts/strict-job-artifact.ts > producers.list
 *
 * Derived rather than listed in the workflow: the declared outputs of every step in that job
 * (`strictJobSteps`), the two stamp stores that make those outputs verifiably current in another job
 * (`--only` refuses a producer whose stamp does not match), and the typecheck legs' build infos, which
 * `dep-files.integration.spec.ts` reads and no step declares. Paths that do not exist are left out, so a
 * pack without generated files lists nothing for them.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { CHAIN_STEPS, orderedSteps } from './lib/chain-steps.ts';
import { strictJobSteps } from './lib/chain-only.ts';
import { STAMP_DIR } from './lib/chain-stamps.ts';
import { DEP_FILE_DIR } from './lib/dep-files.ts';
import { TYPECHECK_LEGS } from './lib/typecheck-legs.ts';

const steps = orderedSteps(CHAIN_STEPS);
const producers = new Set(strictJobSteps(steps, 'producers', TYPECHECK_LEGS.map((leg) => leg.name)));
const outputs = steps.filter((step) => producers.has(step.name)).flatMap((step) => step.outputs ?? []);
// The chain's stamps, without its per-run evidence directories and lock
const chainStamps = fs.existsSync(STAMP_DIR)
  ? fs.readdirSync(STAMP_DIR).filter((name) => name.endsWith('.json')).map((name) => path.join(STAMP_DIR, name))
  : [];
const packageStamps = path.join(REPO_ROOT, 'node_modules', '.cache', 'apack-packages-build');
const paths = [...outputs.map((output) => path.join(REPO_ROOT, output)), ...chainStamps, packageStamps, DEP_FILE_DIR]
  .filter((file) => fs.existsSync(file))
  .map((file) => path.relative(REPO_ROOT, file).split(path.sep).join('/'));
process.stdout.write(`${[...new Set(paths)].sort().join('\n')}\n`);
