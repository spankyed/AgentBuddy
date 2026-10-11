import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import ts from 'typescript';
import { REPO_ROOT } from '@apack/host/build/packages-built';
import { fixtureEnv } from '../../src/commands/test';

/**
 * What the shell may still decide about a pinned run.
 *
 * `apack test` is hermetic: it reads no machine state. `fixtureEnv` is where that is enforced, by
 * stripping the variables the fixture would otherwise read out of the caller's environment — and it is a
 * hand-written list of someone else's inputs, which is the shape that goes stale. It did: `E2E_DATA_DIR`
 * and `E2E_SCREENSHOT_DIR` were never added to it, so an exported one sent a test run at a directory the
 * user owns and, for the data dir, left it behind. `PACK_DIR` with no manifest was a third.
 *
 * So the list is checked against its subject rather than maintained. The subject is derived twice over:
 * the fixture's own module graph, walked from its entry, and the `process.env` reads in those files, taken
 * from the AST so that a variable named in a comment — and this tree comments heavily — is not one.
 */
const FIXTURE_ENTRY = path.join(REPO_ROOT, 'packages', 'apack-testing', 'src', 'index.ts');

/** The fixture and everything it is built from, followed rather than listed. */
function fixtureSources(entry: string, seen = new Set<string>()): string[] {
  if (seen.has(entry) || !fs.existsSync(entry)) return [];
  seen.add(entry);
  const source = ts.createSourceFile(entry, fs.readFileSync(entry, 'utf-8'), ts.ScriptTarget.ESNext, true);
  const found = [entry];
  for (const statement of source.statements) {
    const specifier = (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
      ? statement.moduleSpecifier : undefined;
    if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
      found.push(...fixtureSources(path.resolve(path.dirname(entry), specifier.text), seen));
    }
  }
  return found;
}

/** Each `process.env.X` in those files, and the file it is in. Reads only: a write is the fixture's own. */
function envReads(files: readonly string[]): Map<string, string> {
  const reads = new Map<string, string>();
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf-8'), ts.ScriptTarget.ESNext, true);
    const visit = (node: ts.Node): void => {
      const isEnvRead = ts.isPropertyAccessExpression(node)
        && ts.isPropertyAccessExpression(node.expression)
        && ts.isIdentifier(node.expression.expression)
        && node.expression.expression.text === 'process'
        && node.expression.name.text === 'env'
        && !(ts.isBinaryExpression(node.parent) && node.parent.left === node
          && node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken);
      if (isEnvRead) reads.set((node as ts.PropertyAccessExpression).name.text, path.basename(file));
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return reads;
}

/**
 * Variables a caller means to set, so passing them through is the behaviour rather than a leak. Each is a
 * toggle for one run that changes nothing about which app, pack or directory the run uses — which is the
 * bar: a new entry here has to be something that cannot send the run somewhere else.
 */
const PASSED_THROUGH: Record<string, string> = {
  DEBUG_E2E: "pipes the app's stdout and stderr to the terminal for one run",
  E2E_KEEP_DATA: "keeps the worker's temp data dir so a failure can be looked at",
  PACK_ARCHIVE: 'installs a packed .tgz instead of building the pack, so a run can test the shipped artifact',
};

/** Every shape the two commands call it in. A variable the shell decides in *any* of them is not decided. */
const CALLS = [
  { app: { kind: 'source', root: '/repo' }, packDir: '/pack' },
  { app: { kind: 'source', root: '/repo' }, packDir: undefined },
  { app: { kind: 'packaged', executable: '/exe', version: '1.0.0-beta.0' }, packDir: '/pack' },
  { app: { kind: 'packaged', executable: '/exe', version: '1.0.0-beta.0' }, packDir: undefined },
].flatMap((call) => [{ ...call, release: false }, { ...call, release: true }]);

const SENTINEL = '__set-by-the-shell__';

/** The calls in which a value the caller exported reaches the fixture unchanged. */
function shellDecides(name: string): string[] {
  return CALLS
    .filter((call) => fixtureEnv(
      call.app as Parameters<typeof fixtureEnv>[0],
      call.packDir,
      { [name]: SENTINEL },
      { release: call.release },
    )[name] === SENTINEL)
    .map((call) => `${call.app.kind}${call.packDir ? '' : ', no manifest'}${call.release ? ', --release' : ''}`);
}

describe('what the shell can decide about a pinned run', () => {
  const sources = (): string[] => fixtureSources(FIXTURE_ENTRY);
  const reads = (): Map<string, string> => envReads(sources());

  it('found the fixture and what it reads, so the rule below is not looking at nothing', () => {
    expect(sources().map((file) => path.basename(file)), 'the walk reached the entry and its imports')
      .toEqual(expect.arrayContaining(['index.ts', 'launch-env.ts']));
    expect([...reads().keys()].length, 'the fixture reads some environment').toBeGreaterThan(5);
  });

  it('leaves it none, except the toggles meant for it', () => {
    const leaks = [...reads()]
      .filter(([name]) => !(name in PASSED_THROUGH))
      .map(([name, file]) => ({ name, file, calls: shellDecides(name) }))
      .filter((leak) => leak.calls.length > 0);
    expect(leaks, 'each of these reaches the fixture from the caller\'s environment. Decide it in '
      + 'fixtureEnv (set or delete it), or add it to PASSED_THROUGH with the reason a caller means to set '
      + 'it — which it earns only if it cannot send the run at another app, pack or directory').toEqual([]);
  });

  it('lists no pass-through that has stopped applying', () => {
    const stale = Object.keys(PASSED_THROUGH).filter((name) => !reads().has(name) || shellDecides(name).length === 0);
    expect(stale, 'the fixture no longer reads these, or fixtureEnv now decides them; drop them from '
      + 'PASSED_THROUGH').toEqual([]);
  });

  /**
   * The deriver is the half that can quietly stop looking: a walk that misses an import, or a matcher that
   * misses a read, reports no leak and passes. Both halves are mutated here rather than trusted — the
   * fixture's own tree is never touched, because a spec that edits it would leave the break behind.
   */
  it('follows a new import and finds the read in it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-fixture-reach-'));
    try {
      fs.writeFileSync(path.join(dir, 'entry.ts'), "import './deep.ts';\n");
      fs.writeFileSync(path.join(dir, 'deep.ts'),
        '// process.env.NAMED_IN_A_COMMENT, which this tree does constantly and is not a read\n'
        + "process.env.WRITTEN_NOT_READ = 'x';\n"
        + 'export const x = process.env.ADDED_BY_THIS_TEST;\n');
      const found = envReads(fixtureSources(path.join(dir, 'entry.ts')));
      expect([...found.keys()], 'the walk did not follow the import, the AST matcher missed the read, or '
        + 'it counted a mention in a comment or a write the fixture makes itself')
        .toEqual(['ADDED_BY_THIS_TEST']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
