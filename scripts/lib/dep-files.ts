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
import { PACKAGE_DIRS } from './workspace-deps.ts';

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

/**
 * The TypeScript a dep file has to have been written by to be worth reading — **the one that workspace
 * resolves**, not the repo's.
 *
 * `packages/main` and `packages/preload` pin typescript to an exact version and so carry their own copy,
 * where every other workspace resolves the root's. Comparing every dep file against the root's version
 * called those two untrustworthy, which was the check being coarser than its subject rather than a finding:
 * the question is whether the file was written by the compiler that would run *this* leg.
 *
 * Read once per workspace. The owner is derived from the dep file's name, which is how TypeScript names one
 * per tsconfig — `main` is a package, `api-test` is `api`'s second config.
 */
const versions = new Map<string, string>();
const typeScriptFor = (depFile: string): string => {
  const owner = sourceOf(depFile)?.workspace;
  const key = owner ?? '';
  const found = versions.get(key);
  if (found !== undefined) return found;
  const candidates = owner === undefined ? [] : [path.join(REPO_ROOT, 'packages', owner, 'node_modules', 'typescript', 'package.json')];
  const manifest = [...candidates, path.join(REPO_ROOT, 'node_modules', 'typescript', 'package.json')]
    .find((file) => fs.existsSync(file))!;
  const version = (JSON.parse(fs.readFileSync(manifest, 'utf-8')) as { version: string }).version;
  versions.set(key, version);
  return version;
};

/** Which tsconfig declared a dep file's name, and the workspace that config belongs to */
export interface DepFileSource {
  /** Repo-relative, so a message can name it */
  readonly config: string;
  /** Undefined for a config outside `packages/`, which no workspace owns */
  readonly workspace?: string;
}

/** `"tsBuildInfoFile": "…/x.tsbuildinfo"` — the one place a dep file's name is declared */
const NAMES_A_DEP_FILE = /"tsBuildInfoFile"\s*:\s*"([^"]+)"/;

/**
 * The two tsconfig homes outside `packages/`. Their dep files belong to no workspace, which is the answer
 * every caller wants: a leg that walks the whole tree is the only candidate for them. Named rather than
 * derived because there are two — and `sourceOf` refusing to map a dep file is what would catch a third.
 */
const REPO_LEVEL = ['scripts', 'tests'];

let declared: Map<string, DepFileSource> | undefined;

/**
 * Where a dep file's name comes from, which is the only non-guess answer to "whose reads are these".
 *
 * TypeScript writes one dep file per tsconfig and each config declares the name itself, through
 * `tsBuildInfoFile` — so this is read from a declaration. It used to be inferred from the dep file's name
 * instead (`api-test` starts with `api-`, so it must be `api`'s), a naming convention that nothing held up
 * and that two readers depended on: the compiler-version check below, and the gate deciding which leg
 * answers for a dep file.
 *
 * **Enumerated from `PACKAGE_DIRS`, never by searching the tree.** `.claude/worktrees/` holds entire
 * checkouts, so a filesystem walk for `tsconfig*.json` finds another branch's configs — measured, it does.
 *
 * Memoised: the configs are files this process reads once and nothing rewrites mid-run.
 */
export function sourceOf(depFile: string): DepFileSource | undefined {
  if (declared === undefined) {
    declared = new Map();
    const homes = [
      ...PACKAGE_DIRS.map((dir) => ({ at: path.join('packages', dir), workspace: dir as string | undefined })),
      ...REPO_LEVEL.map((at) => ({ at, workspace: undefined })),
    ];
    for (const { at, workspace } of homes) {
      const dir = path.join(REPO_ROOT, at);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir).filter((name) => /^tsconfig[\w.]*\.json$/.test(name))) {
        const named = NAMES_A_DEP_FILE.exec(fs.readFileSync(path.join(dir, file), 'utf-8'))?.[1];
        // A config writing anywhere else — the renderer's three go to its own `node_modules/.tmp` — has no
        // dep file here to speak for
        if (named === undefined || !named.includes('.cache/tsbuildinfo')) continue;
        declared.set(path.basename(named).replace('.tsbuildinfo', ''), { config: path.join(at, file), ...(workspace === undefined ? {} : { workspace }) });
      }
    }
  }
  return declared.get(depFile);
}

/** Every dep file present, by the name its leg writes under */
export const depFileNames = (): string[] => (fs.existsSync(CACHE)
  ? fs.readdirSync(CACHE).filter((file) => file.endsWith('.tsbuildinfo')).map((file) => file.replace('.tsbuildinfo', '')).sort()
  : []);

/**
 * The repo files a leg read, or `undefined` when there is no evidence.
 *
 * **`undefined` means no evidence; it is never `[]`.** A compiler that ran read something, so an empty
 * `fileNames` is a file that reports nothing rather than a compilation that touched nothing — and this
 * repo has three of them: the renderer's configs write a build info under `node_modules/.tmp` with an
 * empty `fileNames`, because a solution-style config records its references and not a program. Returning
 * `[]` for those would let a coverage check pass over a leg it learned nothing about, which is the exact
 * shape of "a check that reports nothing may have looked at nothing".
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
  // The self-check runs here, not at the call site. A read set from another compiler describes another
  // program, and a caller comparing against it would be comparing against the wrong thing quietly.
  if (untrustworthy(name, { version: typeScriptFor(name) }) !== null) return undefined;
  const info = read(name);
  if (info?.fileNames === undefined || info.fileNames.length === 0) return undefined;
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
