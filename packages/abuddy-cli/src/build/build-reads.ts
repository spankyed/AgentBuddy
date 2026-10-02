/**
 * What a build read, recorded by the bundlers that read it.
 *
 * A **dep file** is the build-system name for a tool reporting its own input set after the fact — Buck2's
 * `dep_files`, Ninja's `depfile`, `gcc -MD`. The repo's typecheck legs already produce one (TypeScript's
 * `tsBuildInfoFile`, read by `scripts/lib/dep-files.ts`), and the two chain steps that run `abuddy build`
 * produced none: their declared inputs were compared against nothing, which is the one gap no coverage
 * check can close, because asking whether every tracked file is *some* step's input cannot catch a step
 * declaring too little.
 *
 * Every bundler here already computes this set and threw it away. esbuild's `metafile.inputs` is the dep
 * file outright; Rollup's `bundle.watchFiles` is the declaration program's file list; Vite's module graph
 * is the same thing for the frontend bundle. So this records what they say rather than inferring anything,
 * and the phases that have no bundler to ask — codegen, the tsx-loaded seed compilation, the feature
 * settings load, the static pack rules — are absent rather than guessed at.
 *
 * **It is a proxy, in the root `CLAUDE.md` taxonomy**: it records what was read *last* time, so it can be
 * stale about a read nobody made yet. That is the known unsoundness of dep files everywhere, and the
 * answer here is the same as for the typecheck legs' — the record carries the bundler versions that wrote
 * it, so a reader can refuse one written by other tools instead of comparing against the wrong thing
 * quietly. It is never a cache key.
 *
 * **Keyed by phase, not one flat list**, because a phase that did not run has to be distinguishable from
 * one that read nothing: a built-in pack stops before the runtime and frontend bundles, and `--skip-fe`
 * and `--skip-generate` skip others. A flat list would answer "nothing was recorded" and "nothing was
 * read" with the same silence, which is the ambiguity `readsOf` was tightened to remove.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Where a build records what it read, pack-relative. Under `.abuddy/`, which `abuddy clean` removes */
export const BUILD_READS_FILE = path.join('.abuddy', 'reads.json');

/**
 * The one way to turn the record off, and it is environmental: a read-only filesystem, or a sandbox that
 * refuses the write. Not a flag, because a guard that depends on how the command was invoked is not a
 * guard — and because absence has to keep meaning "this pack was never built here".
 *
 * **What makes on-by-default affordable is that the bundlers already compute this.** Interleaved A/B
 * against this variable, median of 5 pairs on a 70-76% idle machine, 2026-10-02: 5.2s against 5.1s for a
 * fixture pack and 11.0s against 11.0s for the built-in one — inside the noise either way. A metafile and a
 * module-id list are bookkeeping the build has already done; what costs is the realpath and write at the
 * end, over a few hundred paths. Revisit if a phase ever reports tens of thousands.
 */
const OPT_OUT = 'ABUDDY_NO_BUILD_READS';

/**
 * The bundles of `abuddy build`, in the order it runs them — which is also the order the record is written
 * in, so its keys read as the build rather than as a Map's insertion order.
 *
 * Each is named after what it produces rather than the bundler that produces it: a phase whose bundler is
 * replaced is the same phase, and what reads the record compares phases. The phases that are absent are the
 * ones with no bundler to ask — codegen, the seed compilation, the feature settings load, the pack rules.
 */
export const BUILD_PHASES = [
  'types', 'flowHelperTypes', 'flowHelpersModule', 'dslDefs',
  'seedCompilers', 'seedRuntime', 'stepBuild', 'runtime', 'fe',
] as const;

/** One bundle of `abuddy build`. Derived from the list, which is the declaration. */
export type BuildPhase = (typeof BUILD_PHASES)[number];

/** What one bundle read, as the bundler that ran it reports — including what the bundler says it is */
export interface PhaseRead {
  /** The bundler's package name, and the version it reports of itself: the record's trust check */
  readonly bundler: string;
  readonly version: string;
  /** Absolute, or relative to the directory the bundler ran in */
  readonly files: Iterable<string>;
}

/**
 * Handed to one bundle, so a bundler reports what it read without knowing which phase it is. The phase is
 * decided where it is known — by the command orchestrating the build, not by the module doing the bundling.
 */
export type RecordReads = (read: PhaseRead) => void;

/** The file's shape. Paths are relative to the pack directory, which is what the reader resolves against. */
export interface BuildReadsRecord {
  readonly bundlers: Record<string, string>;
  readonly phases: Record<string, readonly string[]>;
}

export interface BuildReads {
  /** The recorder for one phase */
  forPhase(phase: BuildPhase): RecordReads;
  /** Write the record. Called where the build commits its output, so a failed build records nothing. */
  write(): void;
}

/**
 * The record this build will write, or `undefined` when the build was told not to.
 *
 * `packDir` is where the file goes and what the paths are relative to — a pack author outside this repo
 * has no repo root, and the reader resolves against the pack directory it found the file in.
 */
export function buildReads(packDir: string): BuildReads | undefined {
  if (process.env[OPT_OUT]) return undefined;
  // The directory the bundlers resolve their relative paths against, taken once: esbuild's metafile keys
  // are relative to it, and a build does not change directory
  const cwd = process.cwd();
  const phases = new Map<BuildPhase, Set<string>>();
  const bundlers = new Map<string, string>();

  return {
    forPhase: (phase) => (read) => {
      bundlers.set(read.bundler, read.version);
      const into = phases.get(phase) ?? new Set<string>();
      for (const file of read.files) into.add(file);
      phases.set(phase, into);
    },
    write() {
      // The pack's real path, because every recorded path is realpathed too: a pack under a symlinked
      // directory (macOS's /var, which every temp fixture is under) would otherwise relativise to a
      // walk back out through /private
      const root = fs.realpathSync(packDir);
      const record: BuildReadsRecord = {
        bundlers: Object.fromEntries([...bundlers].sort(([a], [b]) => a.localeCompare(b))),
        phases: Object.fromEntries(BUILD_PHASES
          .filter((phase) => phases.has(phase))
          .map((phase) => [phase, relativeReads(phases.get(phase)!, cwd, root)])),
      };
      const file = path.join(packDir, BUILD_READS_FILE);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      // Through a rename, which is atomic within one filesystem. A reader of this file is not ordered
      // after the build that writes it — in this repo's chain, the step reading the fixture packs' records
      // and the step rebuilding them share no edge and can overlap — so a plain write leaves a window in
      // which the file parses as nothing and reads as a record that cannot be believed.
      const partial = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(partial, `${JSON.stringify(record, null, 2)}\n`);
      fs.renameSync(partial, file);
    },
  };
}

/**
 * The files of one phase, as the record holds them: pack-relative, real, sorted, and only files.
 *
 * Two drops, both judgements rather than readings. A **virtual module** names no file — esbuild writes
 * `<stdin>` for the seed-compiler bundle's generated entry and Rollup prefixes a plugin's own ids with a
 * NUL — so what is kept is what is on disk, asked rather than pattern-matched. And a path in any
 * `node_modules` is dropped, the same judgement `readsOf` makes for the typecheck legs and for the same
 * reason: it is a dependency, which every step already covers through `package-lock.json`, where the
 * reads worth recording are the ones a step might fail to declare. A workspace package is not lost that
 * way — resolving it follows a symlink out of `node_modules`, and realpath is what puts it back under
 * `packages/`, which is exactly where a declaration has to name it.
 */
function relativeReads(files: Iterable<string>, cwd: string, root: string): string[] {
  const out = new Set<string>();
  for (const file of files) {
    if (file.includes('\0')) continue;
    let real: string;
    try {
      real = fs.realpathSync(path.resolve(cwd, file));
    } catch {
      continue;
    }
    if (/(^|[\\/])node_modules[\\/]/.test(real)) continue;
    out.add(path.relative(root, real).split(path.sep).join('/'));
  }
  return [...out].sort();
}
