// What a facade bundle normalises to, and what the committed report says about it.
//
// The normalisation is the whole reason the report exists: `tsc` emits a bundle whose statement order and
// import order are its own business, so a report taken from one verbatim would differ from itself. Every case
// below writes its fixture bundle deliberately **out of** report order — which is why these cases are here
// rather than driven through `apack facade-report`: that command derives its bundle from a pack's sources
// now, and no pack can be asked to emit its declarations in the wrong order on purpose.
//
// The command's own spec is `tests/commands/facade-report.integration.spec.ts`, over a real pack.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compareFacadeReport, facadeReportFile, facadeReportText } from '../../src/build/facade-report';

const PACK = '/packs/demo';

/** The order declarations appear in the report body, which is what the normalisation decides */
const order = (text: string, names: readonly string[]): string[] =>
  names.map((name) => ({ name, at: text.indexOf(name) })).filter((e) => e.at >= 0).sort((a, b) => a.at - b.at).map((e) => e.name);

describe('facadeReportText', () => {
  /**
   * The property the report exists for: a bundle whose statements arrive in any order produces one canonical
   * report. Written with the declarations reversed and the export list first, so a run that merely copied the
   * bundle through would fail this rather than pass it by luck.
   */
  it('puts imports first, then declarations by name, then the export list', () => {
    const report = facadeReportText([
      'export { Zeta, Alpha };',
      'declare type Zeta = 1;',
      "import type { b, a } from 'x';",
      'declare type Alpha = 2;',
    ].join('\n'), PACK, 'demo');

    expect(order(report, ['import type', 'Alpha', 'Zeta', 'export {'])).toEqual(['import type', 'Alpha', 'Zeta', 'export {']);
  });

  it("sorts an import's names, so `{ b, a }` and `{ a, b }` give one report", () => {
    expect(facadeReportText("import type { b, a } from 'x';\ndeclare type T = 1;\n", PACK, 'demo'))
      .toContain("import type { a, b } from 'x';");
  });

  it('names the pack it reports on', () => {
    expect(facadeReportText('declare type T = 1;\n', PACK, 'demo')).toContain('Facade types report for the "demo" pack');
  });

  it("shortens the pack's own path, which is one machine's and not part of the facade", () => {
    const report = facadeReportText(`declare const at: '${PACK}/src/thing.ts';\n`, PACK, 'demo');
    expect(report).toContain("'./src/thing.ts'");
    expect(report).not.toContain(PACK);
  });

  /**
   * The label the bundle is parsed under is this module's to compute, so the command's temp path and the
   * build's `dist` path cannot reach the report between them. Two callers passing different paths is exactly
   * the divergence that would be invisible until a report moved for no reason.
   */
  it('reads the same for one bundle however it reached here', () => {
    const bundle = "import type { b, a } from 'x';\nexport { T };\ndeclare type T = 1;\n";
    expect(facadeReportText(bundle, PACK, 'demo')).toBe(facadeReportText(bundle, PACK, 'demo'));
  });
});

describe('compareFacadeReport', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'facade-report-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const record = (text: string) => {
    fs.mkdirSync(path.dirname(facadeReportFile(dir)), { recursive: true });
    fs.writeFileSync(facadeReportFile(dir), text);
  };

  it('finds a report that matches current, with nothing to say about it', () => {
    const next = facadeReportText('declare type T = 1;\n', dir, 'demo');
    record(next);
    expect(compareFacadeReport(dir, next)).toEqual({ state: 'current' });
  });

  /** Missing and stale are different answers, and only one of them is a diff */
  it('reports a missing report as missing rather than as a difference', () => {
    const comparison = compareFacadeReport(dir, 'anything');
    expect(comparison.state).toBe('missing');
    expect(comparison.problem).toContain("doesn't exist");
    expect(comparison.problem).toContain('facade:update');
  });

  it('reports a report that no longer matches as stale, and names the fix', () => {
    record('## Facade types report for the "demo" pack\n\nstale\n');
    const comparison = compareFacadeReport(dir, facadeReportText('declare type T = 1;\n', dir, 'demo'));
    expect(comparison.state).toBe('stale');
    expect(comparison.problem).toContain('differs');
    expect(comparison.problem).toContain('facade:update');
  });
});
