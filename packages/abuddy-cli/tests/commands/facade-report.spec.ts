// `abuddy facade-report` decides what `etc/pack-types.api.md` holds, and until this spec nothing tested it.
// Not a regression — it was a repo script with top-level code, untestable without spawning — but the move
// that made it a command made it testable, and the normalisation it does is the same *kind* of thing as the
// union sort beside it in `build/declaration-text.ts`, which has nine cases and a two-way mutation check.
//
// The whole point of the normalisation is that the report moves only when the facade does: `tsc` emits a
// bundle whose statement order and import order are its own business, so a report taken from it verbatim
// would differ from itself. Every case below writes its fixture bundle deliberately **out of** report order.
//
// Driven through `callCli`, which chdirs and restores (the command reads `process.cwd()`), captures console
// output, and turns a failure into a `code` rather than letting `process.exit` take the worker down.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { callCli, write } from '../_support/pack-builds';

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facade-report-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** A pack with a facade bundle. `bundle` is written as tsc might emit it, not as the report should read */
function pack(bundle: string, report?: string): void {
  write(dir, {
    'abuddy.json': JSON.stringify({ id: 'demo', name: 'Demo', version: '1.0.0' }),
    'dist/types/pack-types.d.ts': bundle,
    ...(report === undefined ? {} : { 'etc/pack-types.api.md': report }),
  });
}

const reportFile = () => path.join(dir, 'etc', 'pack-types.api.md');
const readReport = () => fs.readFileSync(reportFile(), 'utf-8');
/** The order declarations appear in the report body, which is what the normalisation decides */
const order = (text: string, names: readonly string[]): string[] =>
  names.map((name) => ({ name, at: text.indexOf(name) })).filter((e) => e.at >= 0).sort((a, b) => a.at - b.at).map((e) => e.name);

describe('abuddy facade-report', () => {
  /**
   * The property the report exists for, and the one nothing tested: a bundle whose statements arrive in any
   * order produces one canonical report. Written with the declarations reversed and the export list first, so
   * a run that merely copied the bundle through would fail this rather than pass it by luck.
   */
  it('puts imports first, then declarations by name, then the export list', async () => {
    pack([
      'export { Zeta, Alpha };',
      'declare type Zeta = 1;',
      "import type { b, a } from 'x';",
      'declare type Alpha = 2;',
    ].join('\n'));

    const { code } = await callCli(dir, 'facade-report', ['--update']);
    expect(code).toBe(0);
    expect(order(readReport(), ['import type', 'Alpha', 'Zeta', 'export {'])).toEqual(['import type', 'Alpha', 'Zeta', 'export {']);
  });

  it("sorts an import's names, so `{ b, a }` and `{ a, b }` give one report", async () => {
    pack("import type { b, a } from 'x';\ndeclare type T = 1;\n");
    await callCli(dir, 'facade-report', ['--update']);
    expect(readReport()).toContain("import type { a, b } from 'x';");
  });

  it('names the pack it reports on', async () => {
    pack('declare type T = 1;\n');
    await callCli(dir, 'facade-report', ['--update']);
    expect(readReport()).toContain('Facade types report for the "demo" pack');
  });

  /** Up to date writes nothing: asserted on the bytes, since the message would say so either way */
  it('leaves the report alone when it is current', async () => {
    pack('declare type T = 1;\n');
    await callCli(dir, 'facade-report', ['--update']);
    const recorded = readReport();
    const before = fs.statSync(reportFile()).mtimeMs;

    const { code, output } = await callCli(dir, 'facade-report');
    expect(code).toBe(0);
    expect(output).toContain('is up to date');
    expect(readReport()).toBe(recorded);
    expect(fs.statSync(reportFile()).mtimeMs).toBe(before);
  });

  it('fails on a stale report without writing it, and says how to fix it', async () => {
    pack('declare type T = 1;\n', '## Facade types report for the "demo" pack\n\nstale\n');
    const { code, output } = await callCli(dir, 'facade-report');
    expect(code).toBe(1);
    expect(output).toContain('differs from the built facade types');
    expect(output).toContain('facade:update');
    expect(readReport()).toContain('stale');
  });

  it('rewrites a stale report with --update, and the next check passes', async () => {
    pack('declare type T = 1;\n', 'stale\n');
    expect((await callCli(dir, 'facade-report', ['--update'])).code).toBe(0);
    expect(readReport()).not.toContain('stale');
    expect((await callCli(dir, 'facade-report')).output).toContain('is up to date');
  });

  /** The first thing a pack that has not been built hits, so the message has to name the fix */
  it('tells you to build when there is no facade bundle', async () => {
    write(dir, { 'abuddy.json': JSON.stringify({ id: 'demo', name: 'Demo', version: '1.0.0' }) });
    const { code, output } = await callCli(dir, 'facade-report');
    expect(code).toBe(1);
    expect(output).toContain('abuddy build');
  });

  it('reports a missing report as missing rather than as a difference', async () => {
    pack('declare type T = 1;\n');
    const { code, output } = await callCli(dir, 'facade-report');
    expect(code).toBe(1);
    expect(output).toContain("doesn't exist");
  });
});
