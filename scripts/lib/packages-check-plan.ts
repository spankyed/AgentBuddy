// What `npm run packages:check` decides to run, apart from the running of it (`scripts/packages-check.ts`).
//
// Separate so it can be asked without five subprocesses: the one claim worth holding is that **neither tool is
// given a directory**, because `attw --pack <dir>` packs a tarball inside the tree it is checking and deletes
// it again — a file appearing and vanishing under every other step that reads there. Asking that of a real run
// costs 2s a tree and 6.2s for all five (median of 5, 6.1-6.2s, 73% idle, 2026-10-08), where asking it of the
// plan is free — and the chain runs the step anyway.
//
// **Both tools read the same tarball**, which is the artifact in question: npm ships a tarball, not a
// directory, so a check over the directory is a check over the thing it is derived from. It also means publint
// stops running its own `npm pack --json --dry-run` per tree to work out the file list — five subprocesses
// whose answer is already in the tarball beside it.

/** One tool over one tree */
export interface Check {
  readonly label: string;
  /** The tool, by name: `binFor` resolves it. Never through `npx`, which cost ~210ms a call over nine calls */
  readonly tool: 'publint' | 'attw';
  readonly args: readonly string[];
}

/** A published tree, with the manifest that decides what is asked of it */
export interface PublishedTree {
  readonly pkg: string;
  readonly dir: string;
  readonly manifest: Record<string, unknown>;
}

/**
 * Whether a published manifest offers declarations anywhere — a `types` field, or a `types` condition at any
 * depth of `exports`.
 *
 * It is what decides whether `attw` has anything to say, and `@abuddy/cli` is the one tree where it is false:
 * that package publishes a bundle and no declarations. Derived rather than named, so a sixth package shipping
 * none is skipped for the reason rather than by someone remembering to add it to a list — and one that starts
 * shipping them cannot be left out in silence.
 */
export function declaresTypes(manifest: Record<string, unknown>): boolean {
  const anywhere = (value: unknown): boolean => value !== null && typeof value === 'object'
    && Object.entries(value).some(([key, nested]) => key === 'types' || anywhere(nested));
  return typeof manifest.types === 'string' || anywhere(manifest.exports ?? null);
}

/**
 * Every check the step runs, in the order it runs them.
 *
 * `packInto` is passed in rather than called here, because what it returns is the thing under test: a tarball
 * somewhere of the caller's choosing, never a path inside `dir`.
 */
export function checksFor(trees: readonly PublishedTree[], packInto: (dir: string) => string): Check[] {
  return trees.flatMap(({ pkg, dir, manifest }) => {
    // One tarball per tree, read by both: packed once here rather than once per tool, so the two cannot be
    // looking at different bytes of the same tree
    const tarball = packInto(dir);
    const publint: Check = { label: `publint ${pkg}`, tool: 'publint', args: ['--strict', tarball] };
    if (!declaresTypes(manifest)) return [publint];
    return [publint, { label: `attw ${pkg}`, tool: 'attw', args: [tarball, '--profile', 'esm-only'] }];
  });
}
