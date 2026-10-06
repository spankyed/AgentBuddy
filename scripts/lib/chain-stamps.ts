/**
 * Where the chain keeps a step's success record, and what a step's name becomes on the way there.
 *
 * The definition, not the command — `scripts/chain.ts` is the command over it, the same split as
 * `scripts/lib/unit-pool.ts` over `scripts/test-unit-pool.ts`. It is a module of its own for the same one
 * reason that one is: a spec has to be able to ask what the chain names a stamp, and `chain.ts` runs its
 * `main()` on import, so a spec cannot ask it there. The alternative is a spec that restates the
 * transformation below, which is a second copy of a cache key — the thing most worth not having two of.
 */
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/**
 * Beside the package builds' and the pools' stamps, in the same cache directory and the same format, so one
 * `fingerprintUnit` and one reader cover all three.
 */
export const STAMP_DIR = path.join(REPO_ROOT, 'node_modules', '.cache', 'abuddy-chain');

/**
 * A step's stamp, named after the step with `:` and `/` flattened to `-`.
 *
 * **27 of the 29 step names are rewritten by this**, which is the thing worth knowing before going near the
 * cache by hand: `test:unit:pack` is kept in `test-unit-pack.json`, so an `rm` of the name the chain prints
 * removes nothing and says nothing. The flattening is for the filename's sake — `:` is illegal in one on
 * Windows and displays as `/` in the macOS Finder — and the names are kept rather than hashed so that the
 * directory can be read.
 *
 * **It is not injective, and `chain-stamps.spec.ts` is what makes that safe.** `a:b`, `a/b` and `a-b` all
 * come here as `a-b`, so two steps whose names differ only in a separator would share one record — and
 * sharing a record means running either one marks the other fresh, which is the chain skipping a step that
 * never ran. That is the same defect two halves of a suite had when they shared a key, and the same one the
 * pools' *"give no two of their projects the same stamp"* exists to prevent; this store was the only one of
 * the three without the check.
 */
export const stampFor = (step: string): string => path.join(STAMP_DIR, `${step.replace(/[:/]/g, '-')}.json`);
