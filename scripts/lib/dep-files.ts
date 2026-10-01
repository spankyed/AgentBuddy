/**
 * What the compiler says it read, as a dep file.
 *
 * A **dep file** is the build-system name for a tool reporting its own input set after the fact —
 * Buck2's `dep_files`, Ninja's `depfile`, `gcc -MD`. TypeScript writes one whenever `incremental` is on,
 * and every typecheck leg in this repo sets it (`tsBuildInfoFile`, into `node_modules/.cache/tsbuildinfo`,
 * which is why it survives a `dist` clean and is absent on a fresh clone).
 *
 * **It is a proxy, in this repo's taxonomy** (root `CLAUDE.md`, "Three kinds of recorded artifact"): it
 * records what was read *last* time, so it can go stale from an input nobody listed, exactly as
 * `api:stamp` can. That is the known unsoundness of dep files generally, and it is why Bazel pairs them
 * with sandboxing and Gradle pairs them with "undeclared means uncacheable". Here it is paired with
 * `trustworthy()` below and with the rule that a missing dep file is not a cacheable state.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';

/** Where the legs are configured to write them, which is the one place this looks */
const CACHE = path.join(REPO_ROOT, 'node_modules', '.cache', 'tsbuildinfo');

/** The shape this reads. TypeScript writes more; these are the fields with a contract worth relying on. */
interface BuildInfo {
  readonly fileNames?: readonly string[];
  readonly version?: string;
  readonly options?: Record<string, unknown>;
}

const read = (name: string): BuildInfo | undefined => {
  const file = path.join(CACHE, `${name}.tsbuildinfo`);
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as BuildInfo;
  } catch {
    // A half-written or truncated file is a missing one: both mean "no evidence about what was read"
    return undefined;
  }
};

/** Every dep file present, by the name its leg writes under */
export const depFileNames = (): string[] => (fs.existsSync(CACHE)
  ? fs.readdirSync(CACHE).filter((file) => file.endsWith('.tsbuildinfo')).map((file) => file.replace('.tsbuildinfo', '')).sort()
  : []);

/**
 * The repo files a leg read, or `undefined` when there is no evidence.
 *
 * `undefined` and `[]` are different answers and the caller must not conflate them: no dep file means the
 * leg has never run here, which under Gradle's rule makes it uncacheable rather than fresh. An empty array
 * would say "it read nothing", which is the wrong answer in the one case it matters — a cold tree.
 *
 * Paths in any `node_modules` are dropped, which is the one thing here that is a judgement rather than a
 * reading: they are dependencies, overwhelmingly TypeScript's own `lib.*.d.ts`, and the chain already
 * covers one moving through `package-lock.json` in every step's inputs. **Any** `node_modules`, not a
 * leading one — a package can have its own, and 8401 of the reads recorded here are inside one.
 *
 * **The paths come back lowercased on a case-insensitive filesystem**, which is TypeScript's doing and
 * not something to correct here: it records `baseform.vue` for `BaseForm.vue`. A caller comparing these
 * against a walk of the tree has to fold case or it will report a declared file as undeclared, which is
 * what `dep-files.spec.ts` does and says.
 */
export function readsOf(name: string): readonly string[] | undefined {
  const info = read(name);
  if (info?.fileNames === undefined) return undefined;
  return info.fileNames
    .map((file) => path.relative(REPO_ROOT, path.resolve(CACHE, file)))
    .filter((file) => !file.startsWith('..') && !/(^|\/)node_modules\//.test(file))
    .sort();
}

/**
 * Why a dep file cannot be believed, or `null` when it can — the proxy's self-check.
 *
 * A proxy records a hash of what it *believes* its inputs are, so it goes stale from one nobody listed.
 * `api:stamp` is the repo's other one and it was bitten exactly that way: the set of published entries was
 * missing from its key, so adding one passed the stamp and the whole chain. The lesson recorded there is
 * that a proxy needs a check against *itself*, not only a comparison, and this is that check.
 *
 * Two causes, named separately because they call for different fixes. A compiler upgrade invalidates every
 * recorded read set, and the file says which version wrote it. A changed `tsconfig` changes what the
 * compiler was asked to read, and the file records the options it ran with — so a dep file written under
 * other options describes a different question.
 */
export function untrustworthy(name: string, expect: { version: string; options?: Record<string, unknown> }): string | null {
  const info = read(name);
  if (info === undefined) return `no dep file: ${name} has not run in this checkout, so nothing is recorded about what it reads`;
  if (info.version !== expect.version) {
    return `written by TypeScript ${String(info.version)}, and ${expect.version} is installed: every recorded read set is from another compiler`;
  }
  if (expect.options !== undefined) {
    const moved = Object.keys(expect.options).filter((key) => JSON.stringify(info.options?.[key]) !== JSON.stringify(expect.options?.[key]));
    if (moved.length > 0) return `recorded under different options (${moved.join(', ')}), so it answers a different question`;
  }
  return null;
}
