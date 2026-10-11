// @slow: three cases each build a TypeScript program, which is the subject rather than a detail
// That the generated sends actually type-check.
//
// The three cases that build a TypeScript program, apart from the other 93 because of what they cost:
// ~2.5s against ~130ms for a pure case. `goal-one-job-pool.md` Phase 5 named this boundary — "91 pure, 3
// that invoke a compiler, which is a real tier boundary" — and the shared `ts.CompilerHost` below is what
// took them from 3.13s to 2.46s.
//
// One of five files split from a 1,365-line original; `_support/pack.ts` holds the fixture and why.
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import type { PackSnapshot } from '../../../src/build/manifest.ts';
import { setupPackFixture, dependency, facade, generatePackFiles, manifest, root, system, withPlugin, write, writePluginEntry, writeSystemEntry  } from './_support/pack.ts';

setupPackFixture();

/** Type-checks the generated files at `names` with `root` linked to this SDK's source, and returns the diagnostics */
/**
 * One `ts.SourceFile` cache across the three programs this file builds, so the SDK and ears source is
 * parsed once instead of three times. Each program resolves `@apack/sdk` under the `@apack/source`
 * condition, so it type-checks ~165 files of real source; `skipLibCheck` skips the `.d.ts`, and the SDK is
 * `.ts`.
 *
 * **The cache rule is safe by construction:** `root` is `mkdtemp`'d per test, so every file a test writes
 * is under a path no other test uses. Cache any file that is not under `root`; never one that is.
 *
 * Measured: the three compiling tests go 3.13s -> 2.46s, and the file 10.36s -> 9.43s. Passing `oldProgram`
 * as well was tried and measured at 2.44s and 2.52s against 2.46s without — no difference, so it is not
 * here. The file's remaining cost is not compilation: the other 91 tests are ~7.2s of `generatePackFiles`,
 * which builds something different every time and cannot be cached, and the per-test `mkdtemp`/`rmSync` is
 * 0.15s for all 94.
 */
const parsed = new Map<string, ts.SourceFile | undefined>();
let compilerHost: ts.CompilerHost | undefined;
function sharedHost(options: ts.CompilerOptions): ts.CompilerHost {
  if (!compilerHost) {
    const host = ts.createCompilerHost(options, true);
    const read = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreate) => {
      if (fileName.startsWith(root)) return read(fileName, languageVersion, onError, shouldCreate);
      if (!parsed.has(fileName)) parsed.set(fileName, read(fileName, languageVersion, onError, shouldCreate));
      return parsed.get(fileName);
    };
    compilerHost = host;
  }
  return compilerHost;
}

function typecheck(files: Record<string, string>, names: string[]): string[] {
  for (const [file, content] of Object.entries(files)) if (content) write(file, content);
  write('package.json', JSON.stringify({ type: 'module' }));
  const sdk = path.resolve(import.meta.dirname, '../../..');
  const fromSdk = (name: string) => path.dirname(createRequire(path.join(sdk, 'package.json')).resolve(`${name}/package.json`));
  // The generated facades import the engine too, which a pack installs with the SDK
  const links = { '@apack/sdk': sdk, '@apack/ears': fromSdk('@apack/ears'), zod: fromSdk('zod') };
  for (const [name, target] of Object.entries(links)) {
    const link = path.join(root, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.symlinkSync(target, link, 'dir');
  }
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    customConditions: ['@apack/source'],
    allowImportingTsExtensions: true,
    verbatimModuleSyntax: true,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  };
  const program = ts.createProgram({ rootNames: names.map((name) => path.join(root, name)), options, host: sharedHost(options) });
  return ts.getPreEmitDiagnostics(program)
    .filter((d) => d.file?.fileName.startsWith(root))
    .map((d) => `${path.relative(root, d.file!.fileName)}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
}

/** A dependency whose facade declares `systems` (feature id → incoming event type) */
function typedDependency(systems: Record<string, string>): PackSnapshot {
  const events = Object.entries(systems).map(([id, type]) => `'${id}': { type: '${type}'; n: number }`).join('; ');
  return dependency({ features: Object.keys(systems).map((id) => system(id)) }, facade({ PackSystemEvents: `{ ${events} }` }));
}

describe('generated sends compile', () => {
  it('for feature ids that match generated names, beside a dependency with the same feature ids', () => {
    const ids = ['foo', 'fooEntry', 'specs', 'specEvents', 'ref', 'openPlugin', 'registration', 'steps'];
    for (const id of ids) writeSystemEntry(id, "{ type: 'DONE' }", `{ type: '${id.toUpperCase()}_RUN'; n: number }`);
    const files = generatePackFiles(manifest({ features: ids.map((id) => ({ ...system(id), designation: id === 'foo' ? 'foo' : undefined })) }), {
      packRoot: root,
      depSnapshots: new Map([['base-pack', typedDependency({ foo: 'BASE_FOO_RUN', calendar: 'CALENDAR_RUN' })]]),
    });
    write('src/probe.ts', [
      "import { sendToSystem } from './__generated__/events.ts';",
      ...ids.map((id) => `sendToSystem('${id}', { type: '${id.toUpperCase()}_RUN', n: 1 });`),
      "sendToSystem('base-pack/foo', { type: 'BASE_FOO_RUN', n: 1 });",
      '// @ts-expect-error the own foo system receives FOO_RUN',
      "sendToSystem('foo', { type: 'BASE_FOO_RUN', n: 1 });",
    ].join('\n'));
    expect(typecheck(files, ['src/probe.ts', 'src/__generated__/pack-entry.ts'])).toEqual([]);
  });

  it("for a pack without systems, sending to its dependencies'", () => {
    const files = generatePackFiles(manifest({ features: [{ id: 'sidebar', plugin: { entry: writePluginEntry('src/features/sidebar/fe/plugin.ts') } }] }), {
      packRoot: root,
      depSnapshots: new Map([['base-pack', typedDependency({ calendar: 'CALENDAR_RUN' })]]),
    });
    write('src/probe.ts', [
      "import { sendToSystem } from './__generated__/events.ts';",
      "sendToSystem('base-pack/calendar', { type: 'CALENDAR_RUN', n: 1 });",
      '// @ts-expect-error CALENDAR_RUN needs its n',
      "sendToSystem('base-pack/calendar', { type: 'CALENDAR_RUN' });",
      '// @ts-expect-error the pack has no system of its own',
      "sendToSystem('sidebar', { type: 'CALENDAR_RUN', n: 1 });",
    ].join('\n'));
    expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
  });

  it("to a dependency's plugins and a host plugin, with the events their owner declares", () => {
    writeSystemEntry('memos', "{ type: 'MEMO_ADDED'; text: string }");
    const base = dependency(
      { features: [withPlugin(system('calendar')), withPlugin(system('code'))] },
      facade({ PackPluginEvents: "{ 'calendar': { type: 'TAG_ADDED'; name: string }; 'code': { type: 'FILE_OPENED'; path: string } }" }),
    );
    const files = generatePackFiles(
      manifest({ features: [withPlugin(system('memos'))] }),
      { packRoot: root, depSnapshots: new Map([['base-pack', base]]) },
    );
    write('src/probe.ts', [
      "import { sendToPlugin } from './__generated__/events.ts';",
      "sendToPlugin('memos', { type: 'MEMO_ADDED', text: 'x' });",
      "sendToPlugin('base-pack/calendar', { type: 'TAG_ADDED', name: 'x' });",
      "sendToPlugin('base-pack/code', { type: 'FILE_OPENED', path: 'x' });",
      "sendToPlugin('host/application', { type: 'PLUGIN_VISIBILITY_UPDATED', pluginVisibility: { 'demo-pack/memos': false } });",
      "// @ts-expect-error a dependency's plugin takes only the events its own pack declares for it",
      "sendToPlugin('base-pack/calendar', { type: 'MEMO_ADDED', text: 'x' });",
      "// @ts-expect-error a dependency's plugin is named <pack>/<feature>, as the send resolves it",
      "sendToPlugin('calendar', { type: 'TAG_ADDED', name: 'x' });",
      '// @ts-expect-error the host declares what its application plugin receives',
      "sendToPlugin('host/application', { type: 'MEMO_ADDED', text: 'x' });",
    ].join('\n'));
    expect(typecheck(files, ['src/probe.ts'])).toEqual([]);
  });
});
