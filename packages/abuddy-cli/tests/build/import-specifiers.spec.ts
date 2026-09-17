import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findAppImportsInPackTests, findHostImports, findJsSpecifiers, findPackBackendConsole, findRawPackHelpers, findRawTransport,
  findLmdbImports, findRepositoryCasts, findSharedPackageLists, findUpwardImports, LAYERS, LMDB_RULES, packageSourceDirs, SHARED_LIST_CONSUMERS,
} from '../../../../scripts/check-import-specifiers.ts';
import { REPO_ROOT } from '../helpers/published-packages';

/** scripts/check-import-specifiers.ts: relative imports in sdk, host and ui name TypeScript sources */
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-specifiers-'));
  for (const [file, content] of Object.entries({
    'query.ts': 'export const q = 1;',
    'view.tsx': 'export const v = 1;',
    'module.mts': 'export const m = 1;',
    'common.cts': 'export const c = 1;',
    'declared.d.ts': 'export declare const d: number;',
  })) write(file, content);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, 'src', file)), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', file), content);
}

function problems(file: string, content: string): string[] {
  write(file, content);
  return findJsSpecifiers(['src'], root);
}

describe('findJsSpecifiers', () => {
  it.each([
    ['import', "import { q } from './query.js';"],
    ['side-effect import', "import './query.js';"],
    ['re-export', "export * from './query.js';"],
    ['dynamic import', "export const load = () => import('./query.js');"],
    ['import type', "export type Q = typeof import('./query.js');"],
    ['import-equals', "import q = require('./query.js');"],
    ['require', "const q = require('./query.js');"],
    ['require.resolve', "const q = require.resolve('./query.js');"],
    ['vi.mock', "vi.mock('./query.js', () => ({}));"],
    ['vi.importActual', "await vi.importActual('./query.js');"],
    ['a .tsx target', "import { v } from './view.js';"],
    ['a .mts target', "import { m } from './module.mjs';"],
    ['a .cts target', "import { c } from './common.cjs';"],
  ])('flags: %s', (_form, code) => {
    expect(problems('consumer.ts', code)).toEqual([expect.stringMatching(/^src\/consumer\.ts:1: \.\//)]);
  });

  it.each(['consumer.tsx', 'consumer.mts', 'consumer.cts'])('checks %s files', (file) => {
    expect(problems(file, "import { q } from './query.js';")).toHaveLength(1);
  });

  it('checks .vue script blocks with their line numbers', () => {
    expect(problems('Widget.vue', "<template><div /></template>\n<script setup lang=\"ts\">\nimport { q } from './query.js';\n</script>\n"))
      .toEqual(['src/Widget.vue:3: ./query.js']);
  });

  it('allows .ts specifiers, declaration-only modules and packages', () => {
    expect(problems('consumer.ts', [
      "import { q } from './query.ts';",
      "import type { d } from './declared.js';",
      "import { x } from 'some-package/x.js';",
      "vi.mock('./missing.js');",
    ].join('\n'))).toEqual([]);
  });

  it('runs as a script through a symlinked path', () => {
    const link = path.join(root, 'check.ts');
    fs.symlinkSync(path.join(REPO_ROOT, 'scripts', 'check-import-specifiers.ts'), link);
    const output = execFileSync(path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), [link], { cwd: REPO_ROOT, stdio: 'pipe' }).toString();
    expect(output).toMatch(/Relative import specifiers name \.ts sources/);
    // It checks the whole repo, parsing every file
  }, 60_000);
});

/** Pack code a CLI template writes, in a file under one of CLI_TEMPLATE_SOURCES */
function writeTemplateSource(content: string): string {
  const dir = 'packages/abuddy-cli/src/commands/add';
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, dir, 'feature.ts'), content);
  return dir;
}

/** Code none of the pack rules flag: comments, string text and the allowed imports */
const ALLOWED = [
  "// import { emit } from '@abuddy/sdk/events'; rootEvents; trpc.bus; console.log('x')",
  "/* import * as events from '@abuddy/sdk/events'; console.log('x') */",
  "const url = 'https://console.anthropic.com/settings/keys';",
  "const prompt = `rootEvents.emitOutgoing(event); console.log(ev.type)`;",
  "import { emit, sendToSystem } from '#generated/events';",
  "import { sendToPlugin } from '@/__generated__/events';",
  "import { sendToBrainSystem, onIncoming } from '@abuddy/sdk/events';",
  "import { emit as emitEvent } from 'xstate';",
  "import * as ears from '@abuddy/ears';",
  "import { x } from '@abuddy/sdk/rpcx';",
  'const { busId } = trpc; trpc.buses.list();',
  "logger.info('saved');",
].join('\n');

describe('findRawPackHelpers', () => {
  it.each([
    ["import { emit as emitToPlugin } from '@abuddy/sdk/events';", 'emit from @abuddy/sdk/events'],
    ["import onConnected, { sendToSystem } from '@abuddy/sdk/events';", 'sendToSystem from @abuddy/sdk/events'],
    ["import { sendToPlugin, services } from '@abuddy/sdk/services';", 'sendToPlugin from @abuddy/sdk/services'],
    ["import { registerRepository, tx } from '@abuddy/ears';", 'registerRepository from @abuddy/ears'],
    ["export type { emit } from '@abuddy/sdk/events';", 'emit from @abuddy/sdk/events'],
    ["import * as events from '@abuddy/sdk/events';", '* from @abuddy/sdk/events (import the names)'],
    ["export * from '@abuddy/sdk/events';", '* from @abuddy/sdk/events (import the names)'],
  ])('flags %s', (code, problem) => {
    write('pack/feature.ts', code);
    expect(findRawPackHelpers(['src/pack'], root)).toEqual([`src/pack/feature.ts:1: ${problem}`]);
  });

  it('allows comments, strings and the generated facades, and exempts generated files', () => {
    write('pack/feature.ts', ALLOWED);
    write('pack/__generated__/repositories.ts', "import { registerRepository } from '@abuddy/ears';\n");
    expect(findRawPackHelpers(['src/pack'], root)).toEqual([]);
  });

  it('checks .vue script blocks with their line numbers', () => {
    write('pack/Widget.vue', "<template><pre>import { emit } from '@abuddy/sdk/events'</pre></template>\n<script setup lang=\"ts\">\n\nimport { emit } from '@abuddy/sdk/events';\n</script>\n");
    expect(findRawPackHelpers(['src/pack'], root)).toEqual(['src/pack/Widget.vue:4: emit from @abuddy/sdk/events']);
  });

  it("checks the pack code in the CLI's templates, with its line", () => {
    const dir = writeTemplateSource("const name = 'x';\nexport const SYSTEM = `// ${name}\nconst label = \\`${name}\\`;\nimport { ${name}, emit } from '@abuddy/sdk/events';\n`;\n");
    expect(findRawPackHelpers([dir], root)).toEqual([`${dir}/feature.ts:4: emit from @abuddy/sdk/events`]);
  });
});

describe('findRawTransport', () => {
  it.each([
    ["import { trpc } from '@abuddy/sdk/rpc';", '@abuddy/sdk/rpc'],
    ["const rpc = await import('@abuddy/sdk/rpc/client');", '@abuddy/sdk/rpc/client'],
    ['rootEvents.emitOutgoing(event);', 'rootEvents'],
    ["trpc.bus.send.mutate({ systemId: 'notes', type: 'GET_NOTES' });", 'trpc.bus'],
    ['trpc?.bus.send.mutate(event);', 'trpc.bus'],
  ])('flags %s', (code, problem) => {
    write('pack/feature.ts', code);
    expect(findRawTransport(['src/pack'], root)).toEqual([`src/pack/feature.ts:1: ${problem}`]);
  });

  it('allows comments, strings and the typed sends, and checks generated files', () => {
    write('pack/feature.ts', ALLOWED);
    write('pack/__generated__/events.ts', "\nimport { rootEvents } from '@abuddy/sdk/runtime';\n");
    expect(findRawTransport(['src/pack'], root)).toEqual(['src/pack/__generated__/events.ts:2: rootEvents']);
  });

  it("checks the pack code in the CLI's templates, with its line", () => {
    const dir = writeTemplateSource('export const STATE = `\ntrpc.bus.send.mutate(event);\n`;\n');
    expect(findRawTransport([dir], root)).toEqual([`${dir}/feature.ts:2: trpc.bus`]);
  });
});

describe('findPackBackendConsole', () => {
  it.each([
    ['features/notes/be/system.ts', "console.log('saved');", 'console.log'],
    ['features/hooks.ts', "console?.warn('init');", 'console.warn'],
    ['migrations/0.4.0.ts', "const x = `${console.info('x')}`;", 'console.info'],
    ['extensions/steps/llm/runtime.ts', "console.debug('prompt');", 'console.debug'],
  ])('flags a console use in %s', (file, code, problem) => {
    write(`pack/${file}`, code);
    expect(findPackBackendConsole(['src/pack'], root)).toEqual([`src/pack/${file}:1: ${problem}`]);
  });

  it('allows comments and string text', () => {
    write('pack/features/notes/be/system.ts', ALLOWED);
    expect(findPackBackendConsole(['src/pack'], root)).toEqual([]);
  });

  it('checks backend paths from the pack src root only', () => {
    for (const file of [
      'features/notes/fe/state.ts',
      'extensions/steps/llm/fe.ts',
      'extensions/register-fe.ts',
      'extensions/tiptap/index.ts',
      'extensions/artifacts/viewers/format.ts',
      'extensions/blocks/display/label.ts',
      'extensions/Welcome.vue',
      'features/notes/be/system.spec.ts',
      'features/notes/be/__tests__/helpers.ts',
      'lib/features/notes/be/system.ts',
      'seeds/actions/run.ts',
    ]) write(`pack/${file}`, "console.log('x');");
    expect(findPackBackendConsole(['src/pack'], root)).toEqual([]);
  });

  it("skips the CLI's template sources and single files", () => {
    const dir = writeTemplateSource("console.log('Created pack');");
    write('pack/features/hooks.ts', "console.log('x');");
    expect(findPackBackendConsole([dir, 'src/pack/features/hooks.ts'], root)).toEqual([]);
  });
});

describe('findHostImports', () => {
  it.each([
    ["import { edgeStore } from '@abuddy/host/ears';", '@abuddy/host/ears'],
    ["import type { PackRegistration } from '@abuddy/host/packs';", '@abuddy/host/packs'],
    ["export { hydrate } from '@abuddy/host/ears';", '@abuddy/host/ears'],
    ["const backup = await import('@abuddy/host/backup');", '@abuddy/host/backup'],
    ["const { envs } = require('@abuddy/host/ears');", '@abuddy/host/ears'],
    ["import '@abuddy/host';", '@abuddy/host'],
    // A CLI template writes this as pack source
    ["const REPO = `import { edgeStore } from '@abuddy/host/ears';`;", '@abuddy/host/ears'],
  ])('flags %s', (code, specifier) => {
    write('pack/feature.ts', code);
    expect(findHostImports(['src/pack'], root)).toEqual([`src/pack/feature.ts:1: ${specifier}`]);
  });

  it('checks generated files and allows the SDK', () => {
    write('pack/feature.ts', "import { findRelations, untypedQx } from '@abuddy/ears';\nimport { services } from '#generated/services';\n");
    write('pack/__generated__/ears.ts', "import { qx } from '@abuddy/host/ears';\n");
    expect(findHostImports(['src/pack'], root)).toEqual(['src/pack/__generated__/ears.ts:1: @abuddy/host/ears']);
  });
});

describe('findAppImportsInPackTests', () => {
  it.each([
    ["import { hydrate } from '@abuddy/host/ears';", '@abuddy/host/ears'],
    ["import { openAppStore } from '@/setup/backend';", '@/setup/backend'],
    ["import { rootEvents } from '@/core/router/bus-emitter';", '@/core/router/bus-emitter'],
    ["const { init } = await import('../../../abuddy-cli/src/commands/init');", '../../../abuddy-cli/src/commands/init'],
    ["import { installPackFromLocal } from '../../../abuddy-host/src/packs/pack-installer';", '../../../abuddy-host/src/packs/pack-installer'],
  ])('flags %s', (code, specifier) => {
    write('pack-tests/unit/feature.spec.ts', code);
    expect(findAppImportsInPackTests(['src/pack-tests'], root)).toEqual([`src/pack-tests/unit/feature.spec.ts:1: ${specifier}`]);
  });

  it('allows the SDK, the harness and the pack itself', () => {
    write('pack-tests/unit/feature.spec.ts', [
      "import { untypedQx } from '@abuddy/ears';",
      "import { startApp } from '@abuddy/testing/harness';",
      "import { repository } from '@/__generated__/repository';",
      "import { handler } from '../../src/extensions/steps/llm/runtime';",
    ].join('\n'));
    expect(findAppImportsInPackTests(['src/pack-tests'], root)).toEqual([]);
  });
});

/** A layered package in `root`: its package.json and source files */
function layer(dir: string, manifest: Record<string, unknown>, files: Record<string, string>): void {
  fs.mkdirSync(path.join(root, dir), { recursive: true });
  fs.writeFileSync(path.join(root, dir, 'package.json'), JSON.stringify({ name: 'x', ...manifest }));
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, dir, file)), { recursive: true });
    fs.writeFileSync(path.join(root, dir, file), content);
  }
}

describe('findUpwardImports', () => {
  const layers = LAYERS.map((l) => ({ ...l, dir: `layers/${l.name.slice('@abuddy/'.length)}` }));
  const allowed = () => {
    layer('layers/ears', {}, { 'src/index.ts': "import { x } from './x.ts';\nimport ts from 'typescript';\n" });
    layer('layers/sdk', { dependencies: { '@abuddy/ears': '^0.1.0', yaml: '*' } }, {
      'src/index.ts': "import { tx } from '@abuddy/ears';\nexport type { Q } from '@abuddy/ears/lmdb';\nexport * from '@abuddy/sdk/events';\n",
    });
    layer('layers/host', { dependencies: { '@abuddy/ears': '*', '@abuddy/sdk': '*' } }, {
      'src/index.ts': "import { services } from '@abuddy/sdk/services';\nimport { untypedQx } from '@abuddy/ears';\nimport { x } from '../x.ts';\n",
      'tests/a.spec.ts': "vi.mock('@abuddy/ears');\n",
    });
  };

  it('allows imports down the layers', () => {
    allowed();
    expect(findUpwardImports(layers, root)).toEqual([]);
  });

  it.each([
    ['ears', 'src/query.ts', "import { EARS } from '@abuddy/sdk';", 'layers/ears/src/query.ts:1: @abuddy/sdk'],
    ['ears', 'tests/query.spec.ts', "const { tx } = await import('@abuddy/sdk/testing');", 'layers/ears/tests/query.spec.ts:1: @abuddy/sdk/testing'],
    ['sdk', 'src/services/app.ts', "import { createHostRuntime } from '@abuddy/host/services';", 'layers/sdk/src/services/app.ts:1: @abuddy/host/services'],
    ['sdk', 'src/fe/ui.ts', "export type { Button } from '@abuddy/ui/design/button';", 'layers/sdk/src/fe/ui.ts:1: @abuddy/ui/design/button'],
    ['host', 'src/bus/app.ts', "import { rootEvents } from '@app/api/core/router/bus-emitter';", 'layers/host/src/bus/app.ts:1: @app/api/core/router/bus-emitter'],
    ['host', 'src/bus/app.ts', "import { rootEvents } from '../../../api/src/core/router/bus-emitter.ts';", 'layers/host/src/bus/app.ts:1: ../../../api/src/core/router/bus-emitter.ts'],
    ['host', 'src/bus/app.ts', "import { logger } from '@/core/shared/debug/logger';", 'layers/host/src/bus/app.ts:1: @/core/shared/debug/logger'],
    ['host', 'scripts/x.ts', "import { cli } from '@abuddy/cli';", 'layers/host/scripts/x.ts:1: @abuddy/cli'],
  ])('flags an upward import in %s: %s', (pkg, file, code, problem) => {
    allowed();
    fs.mkdirSync(path.dirname(path.join(root, 'layers', pkg, file)), { recursive: true });
    fs.writeFileSync(path.join(root, 'layers', pkg, file), code);
    expect(findUpwardImports(layers, root)).toEqual([problem]);
  });

  it.each([
    ['ears', { peerDependencies: { '@abuddy/sdk': '*' } }, 'layers/ears/package.json: peerDependencies: @abuddy/sdk'],
    ['sdk', { dependencies: { '@abuddy/ears': '*', '@abuddy/host': '*' } }, 'layers/sdk/package.json: dependencies: @abuddy/host'],
    ['host', { devDependencies: { '@abuddy/cli': '*' } }, 'layers/host/package.json: devDependencies: @abuddy/cli'],
  ])("flags an @abuddy package %s's manifest may not declare", (pkg, manifest, problem) => {
    allowed();
    fs.writeFileSync(path.join(root, 'layers', pkg, 'package.json'), JSON.stringify({ name: 'x', ...manifest }));
    expect(findUpwardImports(layers, root)).toEqual([problem]);
  });

  it('holds for the repo', () => {
    expect(findUpwardImports()).toEqual([]);
  });
});

describe('findLmdbImports', () => {
  // The rules with their directories under the temp root's src/
  const rules = LMDB_RULES.map((rule) => ({
    ...rule,
    dirs: rule.dirs.map((dir) => `src/${dir}`),
    except: rule.except && `src/${rule.except}`,
  }));
  const allowed = () => {
    write('packages/abuddy-ears/src/lmdb/envs.ts', "import { open } from 'lmdb';\nimport type { Partition } from '../persistence/policy.ts';\n");
    write('packages/abuddy-ears/src/index.ts', "export { tx } from './transaction.ts';\n");
    write('packages/abuddy-host/src/services/app-data.ts', "import type { LmdbStore } from '@abuddy/ears/lmdb';\n");
    write('packages/api/src/setup/backend.ts', "import { openLmdbStore } from '@abuddy/ears/lmdb';\n");
    write('packages/default-setup/src/features/notes/be/system.ts', "import { tx } from '@abuddy/ears';\n");
  };

  it('allows the LMDB store to load lmdb, and the host and the API to open it', () => {
    allowed();
    expect(findLmdbImports(rules, root)).toEqual([]);
  });

  it.each([
    ['packages/abuddy-host/src/services/trace-store.ts', "import { open } from 'lmdb';"],
    ['packages/abuddy-host/tests/store.spec.ts', "const lmdb = await import('lmdb');"],
    ['packages/api/src/setup/backend.ts', "import type { Database } from 'lmdb';"],
    ['packages/api/scripts/db/fix.ts', "const { open } = require('lmdb/dist/index.cjs');"],
    ['packages/abuddy-ears/src/index.ts', "export { openLmdbStore } from './lmdb/index.ts';"],
    ['packages/abuddy-ears/src/persistence/policy.ts', "import type { LmdbDbs } from '../lmdb/envs.ts';"],
    ['packages/abuddy-ears/src/query.ts', "import { open } from 'lmdb';"],
    ['packages/default-setup/src/features/notes/be/system.ts', "import { openLmdbStore } from '@abuddy/ears/lmdb';"],
    ['tests/fixtures/external-pack/tests/unit/memos.spec.ts', "vi.mock('lmdb');"],
  ])('flags %s', (file, code) => {
    allowed();
    write(file, code);
    expect(findLmdbImports(rules, root)).toEqual([expect.stringMatching(new RegExp(`^src/${file}:1: `))]);
  });

  it('holds for the repo', () => {
    expect(findLmdbImports()).toEqual([]);
  });
});

describe('findSharedPackageLists', () => {
  it.each([
    ["const EXTERNALS = ['@abuddy/sdk', '@abuddy/sdk/*'];", ['"@abuddy/sdk"', '"@abuddy/sdk/*"']],
    ["if (source.startsWith('@abuddy/ears/')) return;", ['"@abuddy/ears/"']],
    ["bridge({ bridgedPackages: [`@abuddy/ears`] });", ['"@abuddy/ears"']],
  ])('flags a shared package named outside an import: %s', (code, found) => {
    write('consumer.ts', code);
    expect(findSharedPackageLists(['src/consumer.ts'], root)).toEqual(found.map((what) => `src/consumer.ts:1: ${what}`));
  });

  it('allows imports of the packages and their specific modules', () => {
    write('consumer.ts', [
      "import { tx } from '@abuddy/ears';",
      "export * from '@abuddy/sdk';",
      "const sdk = await import('@abuddy/sdk');",
      "const runtime = resolve('@abuddy/sdk/runtime');",
      "// '@abuddy/sdk' in a comment",
      "const message = 'packs import @abuddy/sdk instead';",
    ].join('\n'));
    expect(findSharedPackageLists(['src/consumer.ts'], root)).toEqual([]);
  });

  it('holds for every consumer of SHARED_INSTANCE_PACKAGES', () => {
    for (const file of SHARED_LIST_CONSUMERS) expect(fs.existsSync(path.join(REPO_ROOT, file)), file).toBe(true);
    expect(findSharedPackageLists()).toEqual([]);
  });
});

describe('findRepositoryCasts', () => {
  it.each([
    ['packages/abuddy-sdk/src/seed/seeder.ts', "import { repository } from '@abuddy/ears';\nexport const flows = repository as unknown as { flowsCommands: object };"],
    ['packages/abuddy-host/src/settings/index.ts', 'export const settings = (repository as unknown) as Settings;'],
    ['packages/default-setup/src/features/notes/be/system.ts', 'const notes = (services.repository as unknown as Record<string, unknown>).noteQueries;'],
    ['packages/renderer/src/view.vue', '<script setup lang="ts">\nconst r = repository as unknown as Repos;\n</script>'],
  ])('flags %s', (file, code) => {
    write(file, code);
    const line = file.endsWith('.vue') || file.includes('seeder') ? 2 : 1;
    expect(findRepositoryCasts([`src/${file}`], root)).toEqual([expect.stringMatching(new RegExp(`^src/${file}:${line}: .*repository as unknown`))]);
  });

  it('allows typed repositories, other casts and mentions in comments', () => {
    write('packages/default-setup/src/features/notes/be/system.ts', [
      "import { repository } from '@/__generated__/repository';",
      '// never `repository as unknown as X`',
      'const notes = repository.noteQueries;',
      'const value = data as unknown as Record<string, unknown>;',
      'const repo = repository as Repositories;',
    ].join('\n'));
    expect(findRepositoryCasts(['src/packages/default-setup/src'], root)).toEqual([]);
  });

  it("checks every package's src/", () => {
    expect(packageSourceDirs()).toEqual(expect.arrayContaining([
      'packages/abuddy-ears/src', 'packages/abuddy-sdk/src', 'packages/abuddy-host/src', 'packages/abuddy-testing/src',
      'packages/api/src', 'packages/default-setup/src', 'packages/renderer/src',
    ]));
    fs.mkdirSync(path.join(root, 'packages', 'new-package', 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'packages', 'new-package', 'src', 'index.ts'), 'export const x = (repository as unknown as Repos).x;');
    fs.mkdirSync(path.join(root, 'packages', 'no-sources'), { recursive: true });
    expect(packageSourceDirs(root)).toEqual(['packages/new-package/src']);
    expect(findRepositoryCasts(packageSourceDirs(root), root)).toEqual(['packages/new-package/src/index.ts:1: repository as unknown as Repos']);
  });

  it('holds for the repo', () => {
    expect(findRepositoryCasts()).toEqual([]);
  });
});
