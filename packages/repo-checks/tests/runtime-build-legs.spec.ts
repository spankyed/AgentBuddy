import * as path from 'node:path';
import ts from 'typescript';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
// The table `build:runtime` schedules, and the two claims it rests on that a type cannot make.
//
// `scripts/build-runtime.ts` runs its work on import, so the table is its own module and this is a spec over
// that module — the same split `typecheck-legs`/`typecheck.ts` has. What is worth checking is not the
// shape, which TypeScript has, but that each `command` really names a script the workspace has: npm exits
// **0** for `npm run <missing> -w <ws>`, having printed and done nothing, so a leg naming a renamed script
// would build nothing and report success. `doc-links.spec.ts` guards the same npm behaviour for commands
// quoted in docs.
import { describe, expect, it } from 'vitest';
import { population } from '@apackdev/sdk/testing';
import { RUNTIME_BUILD_LEGS, BUILD_TIMEOUT, type RuntimeBuildLeg } from '../../../scripts/lib/runtime-build-legs.ts';
import { CHAIN_STEPS } from '../../../scripts/lib/chain-steps.ts';
import { workspaceScripts } from '../../../scripts/lib/npm-scripts.ts';

/**
 * The rule, over whatever table it is given — which is what lets the cases below hand it one that breaks.
 *
 * Extracted rather than written inline for `uncollected`'s reason (`spec-placement.spec.ts`): a firing
 * case that restates the comparison proves the fixture is wrong and not that the rule reports it.
 */
const problems = (legs: readonly RuntimeBuildLeg[]): string[] =>
  legs.flatMap((leg) => {
    if (leg.command.includes('${') || leg.command.includes('`')) {
      return [`${leg.name} builds its command by interpolation, which hides the workspace from every reader`];
    }
    const hit = /^npm run ([\w:-]+) -w (\S+)$/.exec(leg.command);
    if (!hit) return [`${leg.name}: ${leg.command} is not a literal \`npm run <script> -w <workspace>\``];
    const [, script, workspace] = hit;
    if (workspace !== leg.name) return [`${leg.name} names ${workspace!}, so a failure would be reported against the wrong one`];
    const scripts = workspaceScripts(workspace!);
    if (scripts === undefined) return [`${leg.name} is no workspace under packages/`];
    if (scripts[script!] === undefined) {
      return [`${leg.name} has no \`${script!}\` script, and npm exits 0 for one that is missing`];
    }
    return [];
  });

describe('the app build legs', () => {
  it('there are some, so the cases below are not reading an empty table', () => {
    expect(population('the app build legs', RUNTIME_BUILD_LEGS).length).toBeGreaterThan(1);
  });

  it('names a script each workspace really has', () => {
    expect(problems(RUNTIME_BUILD_LEGS),
      'npm exits 0 for a script a workspace does not have, so this leg would build nothing and pass')
      .toEqual([]);
  });

  it('builds each workspace once', () => {
    const names = RUNTIME_BUILD_LEGS.map((leg) => leg.name);
    expect([...new Set(names)], 'two legs for one workspace race each other for its dist').toEqual(names);
  });

  it('costs something, since a leg at zero is one whose timeout report reads as a bug', () => {
    for (const leg of RUNTIME_BUILD_LEGS) expect(leg.seconds, leg.name).toBeGreaterThan(0);
  });

  /**
   * One class, read by the runner and by the chain's copy of this step.
   *
   * They are two kill deadlines over one body of work: the chain bounds the step it spawns and the runner
   * bounds each build inside it. A divergence does not lift either — the tighter wins — but it makes the
   * surviving one a surprise, and `chain-graph.spec.ts` holds the same pair for the bounded shell steps.
   */
  it('bounds a build at the class the chain bounds the step at', () => {
    const step = CHAIN_STEPS.find((candidate) => candidate.name === 'build:runtime');
    expect(step, 'no build:runtime step, so this case has nothing to compare against').toBeDefined();
    expect(BUILD_TIMEOUT).toBe(step!.timeout);
  });

  // Over the table, since it agrees today and an assertion over agreement cannot fail on its own
  it('would report a command built by interpolation', () => {
    const [first] = RUNTIME_BUILD_LEGS;
    const interpolated = [{ ...first!, command: `npm run build -w \${name}` }];
    expect(problems(interpolated)).toEqual([expect.stringContaining('by interpolation')]);
  });

  it('would report a leg naming a script its workspace lacks', () => {
    const [first] = RUNTIME_BUILD_LEGS;
    const renamed = [{ ...first!, command: `npm run build-nothing -w ${first!.name}` }];
    expect(problems(renamed)).toEqual([expect.stringContaining('has no `build-nothing` script')]);
  });

  it('would report a leg whose command names another workspace', () => {
    const [first, second] = RUNTIME_BUILD_LEGS;
    const crossed = [{ ...first!, command: `npm run build -w ${second!.name}` }];
    expect(problems(crossed)).toEqual([expect.stringContaining('wrong one')]);
  });
});


it('reads the workspace API type contract from source without needing an API build', () => {
  const configFile = ts.readConfigFile(path.join(REPO_ROOT, 'packages/renderer/tsconfig.app.json'), ts.sys.readFile);
  expect(configFile.error).toBeUndefined();
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.join(REPO_ROOT, 'packages/renderer'));
  expect(config.errors).toEqual([]);
  const importer = path.join(REPO_ROOT, 'packages/renderer/src/transport/index.ts');
  const apiOutput = path.join(REPO_ROOT, 'packages/api/dist') + path.sep;
  const withoutBuild = { ...ts.sys, fileExists: (file: string) => ts.sys.fileExists(file)
    && !(ts.sys.realpath?.(file) ?? file).toLowerCase().startsWith(apiOutput.toLowerCase()) };
  const resolve = (options: ts.CompilerOptions) => ts.resolveModuleName('@app/api', importer, options, withoutBuild).resolvedModule?.resolvedFileName;
  expect(resolve(config.options)).toBe(path.join(REPO_ROOT, 'packages/api/src/types.ts'));
  expect(resolve({ ...config.options, customConditions: [] })).toBeUndefined();
});
