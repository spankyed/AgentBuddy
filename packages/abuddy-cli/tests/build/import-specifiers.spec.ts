import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findAppImportsInPackTests, findCrossCheckoutResolution, findCrossFeatureImports, findHostImports, findJsSpecifiers, findMissingSourceConditions, findPackBackendConsole, findRawPackHelpers,
  findRawTransport, findInternalPackageImports, findLmdbImports, findRepositoryCasts, findSharedPackageLists, findUpwardImports, LAYERS, LMDB_RULES, packageSourceDirs,
  DECLARES_SOURCE_BY_DESIGN, RESOLVES_DIST_BY_DESIGN, SHARED_LIST_CONSUMERS, sourceConditionPackages, SOURCE_CONDITION,
} from '../../../../scripts/check-import-specifiers.ts';
import { REPO_ROOT } from '../helpers/published-packages';

/** scripts/check-import-specifiers.ts, over a temp tree holding the modules the checks resolve against */
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

/** A file at `file` under the temp root */
function writeAt(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

/** A file under the temp root's src/, which the checks below are pointed at */
function write(file: string, content: string): void {
  writeAt(path.join('src', file), content);
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
    expect(output).toMatch(/Import specifiers and pack rules pass/);
    // It checks the whole repo, parsing every file
  }, 60_000);
});

/** Pack code a CLI template writes, in a file under one of CLI_TEMPLATE_SOURCES */
function writeTemplateSource(content: string): string {
  const dir = 'packages/abuddy-cli/src/commands/add';
  writeAt(path.join(dir, 'feature.ts'), content);
  return dir;
}

/** Code none of the pack rules flag: comments, string text and the allowed imports */
const ALLOWED = [
  "// import { sendToPlugin } from '@abuddy/sdk/events'; _rootEvents; trpc.bus; console.log('x')",
  "/* import * as events from '@abuddy/sdk/events'; console.log('x') */",
  "const url = 'https://console.anthropic.com/settings/keys';",
  "const prompt = `_rootEvents.emitOutgoing(event); console.log(ev.type)`;",
  "import { sendToPlugin, sendToSystem } from '#generated/events';",
  "import { sendToPlugin } from '@/__generated__/events';",
  "import { onConnected, onIncoming } from '@abuddy/sdk/events';",
  "import { emit as emitEvent } from 'xstate';",
  "import * as ears from '@abuddy/ears';",
  "import { x } from '@abuddy/sdk/rpcx';",
  'const { busId } = trpc; trpc.buses.list();',
  "logger.info('saved');",
].join('\n');

describe('findInternalPackageImports', () => {
  it.each([
    ["import { _getMediaPath } from '@abuddy/sdk/utils';", '_getMediaPath from @abuddy/sdk/utils'],
    ["const { _getMediaPath } = await import('@abuddy/sdk/utils');", '_getMediaPath from @abuddy/sdk/utils'],
  ])('flags %s', (code, problem) => {
    write('pack/feature.ts', code);
    expect(findInternalPackageImports(['src/pack'], root)).toEqual([`src/pack/feature.ts:1: ${problem}`]);
  });

  it("flags one a pack's tests import, not only its sources", () => {
    writeAt('tests/unit/seed.spec.ts', "import { _getMediaPath } from '@abuddy/sdk/utils';\n");
    expect(findInternalPackageImports(['tests'], root)).toEqual(['tests/unit/seed.spec.ts:1: _getMediaPath from @abuddy/sdk/utils']);
  });

  it('allows public names, a public name aliased to an underscore, a pack-local one and other packages', () => {
    write('pack/feature.ts', [
      "import { seedData, getDataDirPath } from '@abuddy/sdk/utils';",
      "import { formatProviderError as _formatProviderError } from '@abuddy/sdk/actions';",
      "import { _fmt } from './_helpers/format.ts';",
      "import * as utils from '@abuddy/sdk/utils';",
      "import { _ } from 'lodash';",
      ALLOWED,
    ].join('\n'));
    write('pack/__generated__/events.ts', "import { _rootEvents } from '@abuddy/sdk/runtime';\n");
    expect(findInternalPackageImports(['src/pack'], root)).toEqual([]);
  });

  it('holds for the repo', () => {
    expect(findInternalPackageImports()).toEqual([]);
  });
});

describe('findRawPackHelpers', () => {
  it.each([
    ["import { sendToPlugin as toPlugin } from '@abuddy/sdk/events';", 'sendToPlugin from @abuddy/sdk/events'],
    ["import onConnected, { sendToSystem } from '@abuddy/sdk/events';", 'sendToSystem from @abuddy/sdk/events'],
    ["import { sendToPlugin, services } from '@abuddy/sdk/services';", 'sendToPlugin from @abuddy/sdk/services'],
    ["import { registerRepository, tx } from '@abuddy/ears';", 'registerRepository from @abuddy/ears'],
    ["import { unregisterRepository } from '@abuddy/ears';", 'unregisterRepository from @abuddy/ears'],
    ["export type { sendToPlugin } from '@abuddy/sdk/events';", 'sendToPlugin from @abuddy/sdk/events'],
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
    write('pack/Widget.vue', "<template><pre>import { sendToPlugin } from '@abuddy/sdk/events'</pre></template>\n<script setup lang=\"ts\">\n\nimport { sendToPlugin } from '@abuddy/sdk/events';\n</script>\n");
    expect(findRawPackHelpers(['src/pack'], root)).toEqual(['src/pack/Widget.vue:4: sendToPlugin from @abuddy/sdk/events']);
  });

  it("checks the pack code in the CLI's templates, with its line", () => {
    const dir = writeTemplateSource("const name = 'x';\nexport const SYSTEM = `// ${name}\nconst label = \\`${name}\\`;\nimport { ${name}, sendToPlugin } from '@abuddy/sdk/events';\n`;\n");
    expect(findRawPackHelpers([dir], root)).toEqual([`${dir}/feature.ts:4: sendToPlugin from @abuddy/sdk/events`]);
  });
});

describe('findRawTransport', () => {
  it.each([
    ["import { trpc } from '@abuddy/sdk/rpc';", '@abuddy/sdk/rpc'],
    ["const rpc = await import('@abuddy/sdk/rpc/client');", '@abuddy/sdk/rpc/client'],
    ['_rootEvents.emitOutgoing(event);', '_rootEvents'],
    ["trpc.bus.send.mutate({ systemId: 'notes', type: 'GET_NOTES' });", 'trpc.bus'],
    ['trpc?.bus.send.mutate(event);', 'trpc.bus'],
  ])('flags %s', (code, problem) => {
    write('pack/feature.ts', code);
    expect(findRawTransport(['src/pack'], root)).toEqual([`src/pack/feature.ts:1: ${problem}`]);
  });

  it('allows comments, strings and the typed sends, and checks generated files', () => {
    write('pack/feature.ts', ALLOWED);
    write('pack/__generated__/events.ts', "\nimport { _rootEvents } from '@abuddy/sdk/runtime';\n");
    expect(findRawTransport(['src/pack'], root)).toEqual(['src/pack/__generated__/events.ts:2: _rootEvents']);
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
      'extensions/app/Welcome.vue',
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
  writeAt(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', ...manifest }));
  for (const [file, content] of Object.entries(files)) writeAt(path.join(dir, file), content);
}

describe('findUpwardImports', () => {
  const layers = LAYERS.map((l) => ({ ...l, dir: `layers/${path.basename(l.dir).replace(/^abuddy-/, '')}` }));
  const allowed = () => {
    layer('layers/ears', {}, { 'src/index.ts': "import { x } from './x.ts';\nimport ts from 'typescript';\n" });
    layer('layers/sdk', { dependencies: { '@abuddy/ears': '^0.1.0', yaml: '*' } }, {
      'src/index.ts': "import { tx } from '@abuddy/ears';\nexport type { Q } from '@abuddy/ears/lmdb';\nexport * from '@abuddy/sdk/events';\n",
    });
    layer('layers/host', { dependencies: { '@abuddy/ears': '*', '@abuddy/sdk': '*' } }, {
      'src/index.ts': "import { services } from '@abuddy/sdk/services';\nimport { untypedQx } from '@abuddy/ears';\nimport { x } from '../x.ts';\n",
      'tests/a.spec.ts': "vi.mock('@abuddy/ears');\n",
    });
    layer('layers/api', { devDependencies: { '@abuddy/ears': '*', '@abuddy/host': '*', '@abuddy/sdk': '*' } }, {
      'src/setup/backend.ts': "import { openLmdbStore } from '@abuddy/ears/lmdb';\nimport { createHostRuntime } from '@abuddy/host/services';\nimport { bindHost } from '@abuddy/sdk/runtime';\n",
    });
    layer('layers/renderer', { dependencies: { '@abuddy/host': '*', '@abuddy/sdk': '*', '@abuddy/ui': '*' } }, {
      'src/main.ts': "import { createFePackRegistry } from '@abuddy/host/fe';\nimport { bindFeHost } from '@abuddy/sdk/runtime';\n",
      'src/App.vue': "<script setup lang=\"ts\">\nimport Button from '@abuddy/ui/design/button';\n</script>\n",
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
    ['api', 'src/router.ts', "import Button from '@abuddy/ui/design/button';", 'layers/api/src/router.ts:1: @abuddy/ui/design/button'],
    ['renderer', 'src/store.ts', "import { openLmdbStore } from '@abuddy/ears/lmdb';", 'layers/renderer/src/store.ts:1: @abuddy/ears/lmdb'],
  ])('flags an upward import in %s: %s', (pkg, file, code, problem) => {
    allowed();
    writeAt(path.join('layers', pkg, file), code);
    expect(findUpwardImports(layers, root)).toEqual([problem]);
  });

  it.each([
    ['ears', { peerDependencies: { '@abuddy/sdk': '*' } }, 'layers/ears/package.json: peerDependencies: @abuddy/sdk'],
    ['sdk', { dependencies: { '@abuddy/ears': '*', '@abuddy/host': '*' } }, 'layers/sdk/package.json: dependencies: @abuddy/host'],
    ['host', { dependencies: { '@abuddy/ears': '*', '@abuddy/sdk': '*' }, devDependencies: { '@abuddy/cli': '*' } }, 'layers/host/package.json: devDependencies: @abuddy/cli'],
  ])("flags an @abuddy package %s's manifest may not declare", (pkg, manifest, problem) => {
    allowed();
    writeAt(path.join('layers', pkg, 'package.json'), JSON.stringify({ name: 'x', ...manifest }));
    expect(findUpwardImports(layers, root)).toEqual([problem]);
  });

  it.each([
    ['api', { devDependencies: { '@abuddy/ears': '*', '@abuddy/sdk': '*' } }, 'layers/api/package.json: undeclared: @abuddy/host'],
    ['renderer', { dependencies: { '@abuddy/host': '*', '@abuddy/sdk': '*' } }, 'layers/renderer/package.json: undeclared: @abuddy/ui'],
    ['host', { dependencies: { '@abuddy/sdk': '*' } }, 'layers/host/package.json: undeclared: @abuddy/ears'],
  ])('flags an @abuddy package %s imports without declaring it', (pkg, manifest, problem) => {
    allowed();
    writeAt(path.join('layers', pkg, 'package.json'), JSON.stringify({ name: 'x', ...manifest }));
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
    ['bridge({ bridgedPackages: [`@abuddy/ears`] });', ['"@abuddy/ears"']],
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

describe('findCrossFeatureImports', () => {
  const src = 'pack/src';

  it("flags another feature's machine or component, by alias or relative path", () => {
    writeAt(`${src}/features/code/fe/panel.vue`, "<script setup lang=\"ts\">\nimport { id } from '@/features/actions/fe/state'\n</script>");
    writeAt(`${src}/extensions/viewer.ts`, "import List from '../features/notes/fe/canvas/list.vue';");
    expect(findCrossFeatureImports([src], root)).toEqual([
      `${src}/extensions/viewer.ts:1: ../features/notes/fe/canvas/list.vue`,
      `${src}/features/code/fe/panel.vue:2: @/features/actions/fe/state`,
    ]);
  });

  it("allows a feature's own frontend, another's public module, backend and shared modules, and generated code", () => {
    writeAt(`${src}/features/code/fe/panel.ts`, [
      "import { codeChild } from '@/features/code/fe/utils/parent-communication';",
      "import { useActionsList } from '@/features/actions/fe/public';",
      "import { pluginSettings } from '@/features/settings/plugin-settings';",
      "import type { ActionEntity } from '@/features/actions/be/types';",
    ].join('\n'));
    writeAt(`${src}/features/code/fe/features/list.ts`, "import state from '../state';");
    writeAt(`${src}/__generated__/pack-entry-fe.ts`, "import plugin from '../features/notes/fe/plugin.js';");
    expect(findCrossFeatureImports([src], root)).toEqual([]);
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
    writeAt('packages/new-package/src/index.ts', 'export const x = (repository as unknown as Repos).x;');
    fs.mkdirSync(path.join(root, 'packages', 'no-sources'), { recursive: true });
    expect(packageSourceDirs(root)).toEqual(['packages/new-package/src']);
    expect(findRepositoryCasts(packageSourceDirs(root), root)).toEqual(['packages/new-package/src/index.ts:1: repository as unknown as Repos']);
  });

  it('holds for the repo', () => {
    expect(findRepositoryCasts()).toEqual([]);
  });
});

/** A workspace package whose exports resolve source under the condition, and a consumer that imports it */
function workspace(): void {
  writeAt('packages/lib/package.json', JSON.stringify({
    name: '@abuddy/lib',
    exports: { '.': { [SOURCE_CONDITION]: './src/index.ts', default: './dist/index.js' } },
  }));
  writeAt('packages/lib/src/index.ts', 'export const x = 1;');
  writeAt('packages/consumer/package.json', JSON.stringify({ name: '@app/consumer' }));
  writeAt('packages/consumer/src/app.ts', "import { x } from '@abuddy/lib';\nexport const y = x;\n");
}

/** A second package with code of its own, for the configs that reach across directories */
function otherPackage(): void {
  writeAt('packages/other/package.json', JSON.stringify({ name: '@app/other' }));
  writeAt('packages/other/src/own.ts', 'export const own = 1;\n');
}

/** The problems for the temp root, with the given exceptions in place of the repo's */
function conditionProblems(exceptions = new Map<string, string>(), packExceptions = new Map<string, string>()): string[] {
  return findMissingSourceConditions(root, exceptions, packExceptions);
}

const NEEDS = (file: string, option: string) =>
  `${file}: needs ${option} with "${SOURCE_CONDITION}", or an entry in RESOLVES_DIST_BY_DESIGN saying why it resolves dist`;
const TSCONFIG_OPTION = 'compilerOptions.customConditions';
const VITE_OPTION = 'resolve.conditions (and ssr.resolve.conditions)';

describe('findCrossCheckoutResolution', () => {
  it('holds for the repo', () => {
    expect(findCrossCheckoutResolution()).toEqual([]);
  });

  it('catches a checkout that resolves a workspace package to another one', () => {
    // What a worktree nested in the repository does: its own build output is missing, so TypeScript
    // keeps walking up and resolves the package to the parent checkout's
    const outer = path.join(root, 'outer');
    const inner = path.join(outer, 'nested', 'worktree');
    for (const checkout of [outer, inner]) {
      writeAt(path.relative(root, path.join(checkout, 'package.json')), JSON.stringify({ name: 'root', workspaces: ['packages/*'] }));
      writeAt(path.relative(root, path.join(checkout, 'packages', 'api', 'package.json')), JSON.stringify({ name: '@app/api', types: 'dist/types.d.ts' }));
    }
    // Only the outer checkout is built, and the inner one links the package it hasn't built
    writeAt(path.relative(root, path.join(outer, 'packages', 'api', 'dist', 'types.d.ts')), 'export {};\n');
    fs.mkdirSync(path.join(inner, 'node_modules', '@app'), { recursive: true });
    fs.symlinkSync(path.join(inner, 'packages', 'api'), path.join(inner, 'node_modules', '@app', 'api'), 'dir');
    fs.mkdirSync(path.join(outer, 'node_modules', '@app'), { recursive: true });
    fs.symlinkSync(path.join(outer, 'packages', 'api'), path.join(outer, 'node_modules', '@app', 'api'), 'dir');

    expect(findCrossCheckoutResolution(outer)).toEqual([]);
    expect(findCrossCheckoutResolution(inner)).toEqual([
      // realpath: on macOS the temp dir is /var/… and resolves to /private/var/…
      expect.stringContaining(`@app/api resolves to ${fs.realpathSync(path.join(outer, 'packages', 'api', 'dist', 'types.d.ts'))}, outside this checkout`),
    ]);
  });
});

describe('findMissingSourceConditions', () => {
  beforeEach(workspace);

  it('lists the workspace packages whose exports resolve source under the condition', () => {
    expect(sourceConditionPackages(root)).toEqual(['@abuddy/lib']);
    // @abuddy/testing is not among them: its entries resolve its built bundle whoever loads them, so a
    // config importing it selects nothing and needs no condition
    expect(sourceConditionPackages()).toEqual(['@abuddy/ears', '@abuddy/sdk', '@abuddy/ui']);
  });

  // Every config-file name the check recognises, with the option each kind declares the condition in
  it.each([
    ['tsconfig.json', '{ "compilerOptions": { "strict": true } }', TSCONFIG_OPTION],
    ['tsconfig.build.json', '{ "extends": "./tsconfig.json" }', TSCONFIG_OPTION],
    ['tsconfig-build.json', '{ "compilerOptions": { "strict": true } }', TSCONFIG_OPTION],
    ['vite.config.ts', 'export default { build: {} };', VITE_OPTION],
    ['vite.config.prod.ts', 'export default { build: {} };\n', VITE_OPTION],
    ['vitest.config.mts', 'export default { test: {} };', VITE_OPTION],
    ['vitest.node.config.mts', 'export default { test: {} };\n', VITE_OPTION],
    ['tsup.config.ts', "export default { entry: ['src/app.ts'] };", 'conditions'],
    ['tsdown.config.ts', "export default { entry: ['src/app.ts'] };", 'conditions'],
    ['rollup.config.mjs', "export default { input: 'src/app.ts' };\n", 'conditions'],
    ['rollup-defs.config.mjs', "export default { input: 'src/app.ts' };\n", 'conditions'],
    ['esbuild.config.ts', 'export default { entry: [] };\n', 'conditions'],
    ['build.config.ts', 'export default { entries: [] };\n', 'conditions'],
  ])('flags %s, naming the option it needs', (file, content, option) => {
    writeAt(`packages/consumer/${file}`, content);
    expect(conditionProblems()).toEqual([NEEDS(`packages/consumer/${file}`, option)]);
  });

  it.each([
    ['declared directly', 'tsconfig.json', '{ "compilerOptions": { "customConditions": ["@abuddy/source"] } }'],
    ['a vite config listing it', 'vite.config.ts', "export default { resolve: { conditions: ['@abuddy/source'] } };"],
    ['a list the file declares', 'vitest.config.ts', `const conditions = ['${SOURCE_CONDITION}', 'node'];\nexport default { resolve: { conditions } };\n`],
    ['a spread of a list the file declares', 'vitest.config.ts', `const base = ['${SOURCE_CONDITION}'];\nexport default { resolve: { conditions: [...base, 'node'] } };\n`],
    ['an option set by assignment', 'vitest.config.ts', `export default { esbuildOptions(o) { o.conditions = ['${SOURCE_CONDITION}', 'module']; } };\n`],
  ])('accepts a config declaring the condition with %s', (_form, file, content) => {
    writeAt(`packages/consumer/${file}`, content);
    expect(conditionProblems()).toEqual([]);
  });

  it('follows an extends chain and a config merged from another one', () => {
    writeAt('packages/consumer/tsconfig.json', '{ "compilerOptions": { "customConditions": ["@abuddy/source"] } }');
    // A comment and a trailing comma: tsconfigs are JSONC
    writeAt('packages/consumer/tsconfig.test.json', '{\n  // built on the package tsconfig\n  "extends": "./tsconfig.json",\n}');
    writeAt('packages/consumer/vite.config.ts', "export default { resolve: { conditions: ['@abuddy/source'] } };");
    writeAt('packages/consumer/vitest.config.ts', "import viteConfig from './vite.config';\nexport default mergeConfig(viteConfig, {});");
    expect(conditionProblems()).toEqual([]);
  });

  it.each([
    ['a tsconfig extending a package base', '{ "extends": "@app/tsconfig/base.json" }'],
    ['a tsconfig extending a file named anything', '{ "extends": "./base.tsconfig.json" }'],
  ])('follows %s', (_form, content) => {
    writeAt('packages/consumer/node_modules/@app/tsconfig/package.json', JSON.stringify({ name: '@app/tsconfig' }));
    writeAt('packages/consumer/node_modules/@app/tsconfig/base.json', `{ "compilerOptions": { "customConditions": ["${SOURCE_CONDITION}"] } }`);
    writeAt('packages/consumer/base.tsconfig.json', `{ "compilerOptions": { "customConditions": ["${SOURCE_CONDITION}"] } }`);
    writeAt('packages/consumer/tsconfig.json', content);
    expect(conditionProblems()).toEqual([]);
  });

  it('takes the conditions a config sets over the ones it merged, which they replace', () => {
    writeAt('packages/consumer/vite.config.ts', `export default { resolve: { conditions: ['${SOURCE_CONDITION}'] } };\n`);
    writeAt('packages/consumer/vitest.config.ts', "import viteConfig from './vite.config';\nexport default mergeConfig(viteConfig, { resolve: { conditions: ['node'] } });\n");
    expect(conditionProblems()).toEqual([NEEDS('packages/consumer/vitest.config.ts', VITE_OPTION)]);
  });

  it.each([
    ['the condition named in another option', `export default { test: { exclude: ['${SOURCE_CONDITION}'] } };\n`],
    ['the condition named in an unrelated string', `export default { name: '${SOURCE_CONDITION} demo', test: {} };\n`],
    ['a comment before a closing token', `export default { test: {\n  // '${SOURCE_CONDITION}' would go here\n} };\n`],
    ['a comment after the last element', `export default { resolve: { conditions: [\n  'node',\n  // and '${SOURCE_CONDITION}', one day\n] } };\n`],
    ['the condition named only in a comment', `// resolve.conditions carries '${SOURCE_CONDITION}' — in a comment, so it declares nothing\nexport default { test: {} };\n`],
  ])('declares nothing with %s', (_form, content) => {
    writeAt('packages/consumer/vitest.config.ts', content);
    expect(conditionProblems()).toEqual([NEEDS('packages/consumer/vitest.config.ts', VITE_OPTION)]);
  });

  it.each([
    ['comes from outside this file', "import { conditions } from './shared-conditions';\nexport default { resolve: { conditions } };\n"],
    ['is built by', 'export default { resolve: { conditions: buildConditions() } };\n'],
  ])("says a condition list that %s can't be read", (why, content) => {
    writeAt('packages/consumer/vitest.config.ts', content);
    expect(conditionProblems()).toEqual([expect.stringContaining(why)]);
  });

  it('ignores a config whose tree imports no source-condition package, and a solution tsconfig', () => {
    otherPackage();
    writeAt('packages/other/src/app.ts', "import { readFile } from 'node:fs/promises';\nexport const r = readFile;\n");
    writeAt('packages/other/tsconfig.json', '{ "compilerOptions": { "strict": true } }');
    writeAt('packages/consumer/tsconfig.json', '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }');
    writeAt('packages/consumer/tsconfig.app.json', '{ "compilerOptions": { "customConditions": ["@abuddy/source"] } }');
    expect(conditionProblems()).toEqual([]);
  });

  it('ignores the package name in a comment or a string, and skips node_modules and dist', () => {
    writeAt('packages/plain/package.json', JSON.stringify({ name: '@app/plain' }));
    writeAt('packages/plain/src/app.ts', "// import { x } from '@abuddy/lib';\nexport const hint = 'install @abuddy/lib first';\n");
    writeAt('packages/plain/node_modules/dep/index.ts', "import { x } from '@abuddy/lib';\n");
    writeAt('packages/plain/dist/index.js', "import { x } from '@abuddy/lib';\n");
    writeAt('packages/plain/tsconfig.json', '{ "compilerOptions": { "strict": true } }');
    expect(conditionProblems()).toEqual([]);
  });

  it('asks nothing of the config in a directory whose own code imports nothing', () => {
    writeAt('packages/consumer/tsconfig.json', `{ "compilerOptions": { "customConditions": ["${SOURCE_CONDITION}"] }, "include": ["src/**/*"] }`);
    writeAt('packages/consumer/tsconfig.scripts.json', '{ "compilerOptions": { "strict": true }, "include": ["scripts/**/*.ts"] }');
    writeAt('packages/consumer/scripts/run.ts', "import { readFile } from 'node:fs/promises';\nexport const r = readFile;\n");
    expect(conditionProblems()).toEqual([]);
  });

  it('compiles the include of a tsconfig that lists no files but references others', () => {
    writeAt('packages/consumer/tsconfig.json', '{ "files": [], "references": [{ "path": "./tsconfig.node.json" }], "include": ["src/**/*"] }');
    expect(conditionProblems()).toEqual([NEEDS('packages/consumer/tsconfig.json', TSCONFIG_OPTION)]);
  });

  it.each([
    ['a tsconfig whose include reaches another package', 'packages/other/tsconfig.json', '{ "include": ["../consumer/src/**/*"] }'],
    ['a bundler config whose root is another package', 'packages/other/vite.config.ts', "export default defineConfig(() => ({ root: '../consumer' }));\n"],
  ])('sees %s', (_form, file, content) => {
    otherPackage();
    writeAt(file, content);
    expect(conditionProblems()).toEqual([expect.stringContaining(`${file}: needs `)]);
  });

  it('reads the declarations a tsconfig compiles, which resolve @abuddy imports too', () => {
    otherPackage();
    writeAt('packages/other/api.d.ts', "import type { X } from '@abuddy/lib';\nexport type Y = X;\n");
    writeAt('packages/other/tsconfig.json', '{ "compilerOptions": { "strict": true } }');
    expect(conditionProblems()).toEqual([NEEDS('packages/other/tsconfig.json', TSCONFIG_OPTION)]);
  });

  it.each([
    ['a projects list', "export default { test: { projects: ['packages/consumer', 'packages/lib'] } };\n"],
    // Vitest's older field for the same thing
    ['the older workspace field', "export default { test: { workspace: ['packages/consumer', 'packages/lib'] } };\n"],
    // A list the file declares is still a list of paths
    ['a projects list the file declares', "const projects = ['packages/consumer', 'packages/lib'];\nexport default { test: { projects } };\n"],
  ])('asks nothing of a vitest config whose projects all name another config: %s', (_form, content) => {
    writeAt('vitest.config.ts', content);
    expect(conditionProblems()).toEqual([]);
  });

  it.each([
    // One project defined inline has no config of its own, so this config resolves for it
    ['a project defined inline', "export default { test: { projects: ['packages/consumer', { test: { root: 'packages/lib' } }] } };\n"],
    // A config that lists projects and also runs test files of its own compiles those files
    ['a projects list beside its own include', "export default { test: { projects: ['packages/consumer'], include: ['packages/consumer/**/*.spec.ts'] } };\n"],
    ['a projects list beside its own setupFiles', "export default { test: { projects: ['packages/consumer'], setupFiles: ['./setup.ts'] } };\n"],
    // `projects` is somebody else's option here: vite-tsconfig-paths takes one
    ['a projects option that is not the test one', "export default { define: { projects: ['packages/consumer'] }, test: { } };\n"],
    ['a plugin option named projects', "export default { plugins: [tsconfigPaths({ projects: ['./tsconfig.test.json'] })], test: {} };\n"],
  ])('flags a vitest config with %s', (_form, content) => {
    writeAt('vitest.config.ts', content);
    expect(conditionProblems()).toEqual([expect.stringContaining('vitest.config.ts: needs resolve.conditions')]);
  });

  it('says what to change when a projects list is built at run time', () => {
    writeAt('vitest.config.ts', 'export default { test: { projects: discoverProjects() } };\n');
    expect(conditionProblems()).toEqual([expect.stringContaining("its projects isn't a literal list of project paths")]);
  });

  it('sees code reachable only through a symlinked directory, and ends on a symlink to an ancestor', () => {
    writeAt('elsewhere/app.ts', "import { x } from '@abuddy/lib';\nexport const y = x;\n");
    writeAt('packages/other/package.json', JSON.stringify({ name: '@app/other' }));
    writeAt('packages/other/vite.config.ts', 'export default { build: {} };\n');
    fs.symlinkSync(path.join(root, 'elsewhere'), path.join(root, 'packages/other/src'));
    // A directory symlinked to its own ancestor: the walk records real paths, so it ends
    fs.symlinkSync(path.join(root, 'packages'), path.join(root, 'packages/other/loop'));
    const started = Date.now();
    expect(conditionProblems()).toEqual([expect.stringContaining('packages/other/vite.config.ts: needs ')]);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  const REASON = 'API Extractor analyses .d.ts';

  it('takes an exception with its reason instead of flagging the config', () => {
    writeAt('packages/consumer/tsconfig.api-extractor.json', '{ "compilerOptions": { "strict": true } }');
    expect(conditionProblems()).toHaveLength(1);
    expect(conditionProblems(new Map([['packages/consumer/tsconfig.api-extractor.json', REASON]]))).toEqual([]);
  });

  it.each([
    ['the config declares the condition', 'tsconfig.json', 'it already declares the condition or compiles no such code'],
    ['the config is gone', 'gone.config.ts', 'the config is gone'],
  ])('reports an exception that no longer applies: %s', (_form, file, why) => {
    writeAt('packages/consumer/tsconfig.json', '{ "compilerOptions": { "customConditions": ["@abuddy/source"] } }');
    expect(conditionProblems(new Map([[`packages/consumer/${file}`, REASON]])))
      .toEqual([`packages/consumer/${file}: listed in RESOLVES_DIST_BY_DESIGN (${REASON}) but ${why}`]);
  });

  it('records why the api-extractor tsconfigs resolve dist', () => {
    for (const file of ['packages/abuddy-sdk/tsconfig.api-extractor.json', 'packages/abuddy-ui/tsconfig.api-extractor.json']) {
      expect(fs.existsSync(path.join(REPO_ROOT, file)), file).toBe(true);
      expect(RESOLVES_DIST_BY_DESIGN.get(file), file).toMatch(/API Extractor/);
    }
  });

  it('names the manifest that does not parse', () => {
    writeAt('packages/broken/package.json', '{ "name": ');
    expect(() => sourceConditionPackages(root)).toThrow(/packages\/broken\/package\.json: invalid JSON/);
  });

  // The other half of the rule: a pack resolves what a pack author has, which is the published dist. A
  // pack config declaring the condition compiles against a layout that exists only in this checkout.
  describe('a pack, which is any directory holding abuddy.json', () => {
    const MUST_NOT = (file: string, option: string) =>
      `${file}: a pack resolves the @abuddy packages' published dist, so it must not declare "${SOURCE_CONDITION}" in ${option}`
      + '; move a host-side config out of the pack tree, or add it to DECLARES_SOURCE_BY_DESIGN saying why it belongs there';

    /** A pack in the temp root, with the same importing source a host consumer has */
    function pack(dir = 'packages/my-pack'): string {
      writeAt(`${dir}/abuddy.json`, JSON.stringify({ id: 'my-pack', version: '0.1.0' }));
      writeAt(`${dir}/package.json`, JSON.stringify({ name: '@app/my-pack' }));
      writeAt(`${dir}/src/app.ts`, "import { x } from '@abuddy/lib';\nexport const y = x;\n");
      return dir;
    }

    it.each([
      ['a tsconfig', 'tsconfig.json', '{ "compilerOptions": { "customConditions": ["@abuddy/source"] } }', TSCONFIG_OPTION],
      ['a vitest config', 'vitest.config.ts', `export default { resolve: { conditions: ['${SOURCE_CONDITION}'] } };`, VITE_OPTION],
      ['a vite config', 'vite.config.ts', `export default { resolve: { conditions: ['${SOURCE_CONDITION}'] } };`, VITE_OPTION],
    ])('flags %s that declares the condition', (_form, file, content, option) => {
      const dir = pack();
      writeAt(`${dir}/${file}`, content);
      expect(conditionProblems()).toEqual([MUST_NOT(`${dir}/${file}`, option)]);
    });

    it('accepts a pack config that declares none, where a host config would be flagged', () => {
      const dir = pack();
      writeAt(`${dir}/tsconfig.json`, '{ "compilerOptions": { "strict": true } }');
      writeAt(`${dir}/vitest.config.ts`, 'export default { test: {} };\n');
      expect(conditionProblems()).toEqual([]);
      // The same config outside a pack is the host half of the rule
      writeAt('packages/consumer/vitest.config.ts', 'export default { test: {} };\n');
      expect(conditionProblems()).toEqual([NEEDS('packages/consumer/vitest.config.ts', VITE_OPTION)]);
    });

    it('covers a config anywhere under the pack, not just beside its manifest', () => {
      const dir = pack();
      writeAt(`${dir}/tests/vitest.config.ts`, `export default { resolve: { conditions: ['${SOURCE_CONDITION}'] } };`);
      expect(conditionProblems()).toEqual([MUST_NOT(`${dir}/tests/vitest.config.ts`, VITE_OPTION)]);
    });

    // A condition list this check cannot read is no excuse: it may or may not carry the condition
    it('flags a pack config whose condition list it cannot read', () => {
      const dir = pack();
      writeAt(`${dir}/vitest.config.ts`, 'export default { resolve: { conditions: buildConditions() } };\n');
      expect(conditionProblems()).toEqual([MUST_NOT(`${dir}/vitest.config.ts`, VITE_OPTION)]);
    });

    it('holds for every pack in the repo, built-in and fixture', () => {
      expect(findMissingSourceConditions()).toEqual([]);
    });

    // The escape for a host-side config that lives in a pack's tree. It is deliberately hard to reach
    // for: the message names it, and an entry that stops applying is reported like any other.
    describe('DECLARES_SOURCE_BY_DESIGN', () => {
      const WHY = 'a Vite config the renderer builds this pack with';

      it('takes an exception with its reason instead of flagging the config', () => {
        const dir = pack();
        writeAt(`${dir}/vite.config.ts`, `export default { resolve: { conditions: ['${SOURCE_CONDITION}'] } };`);
        expect(conditionProblems()).toHaveLength(1);
        expect(conditionProblems(undefined, new Map([[`${dir}/vite.config.ts`, WHY]]))).toEqual([]);
      });

      it('excepts only the config it names, not the pack around it', () => {
        const dir = pack();
        writeAt(`${dir}/vite.config.ts`, `export default { resolve: { conditions: ['${SOURCE_CONDITION}'] } };`);
        writeAt(`${dir}/vitest.config.ts`, `export default { resolve: { conditions: ['${SOURCE_CONDITION}'] } };`);
        expect(conditionProblems(undefined, new Map([[`${dir}/vite.config.ts`, WHY]])))
          .toEqual([MUST_NOT(`${dir}/vitest.config.ts`, VITE_OPTION)]);
      });

      it.each([
        ['the config no longer declares the condition', 'export default { test: {} };\n', 'it declares no condition, so it needs no exception'],
        ['the config is gone', undefined, 'the config is gone'],
      ])('reports an exception that no longer applies: %s', (_form, content, why) => {
        const dir = pack();
        if (content !== undefined) writeAt(`${dir}/vite.config.ts`, content);
        expect(conditionProblems(undefined, new Map([[`${dir}/vite.config.ts`, WHY]])))
          .toEqual([`${dir}/vite.config.ts: listed in DECLARES_SOURCE_BY_DESIGN (${WHY}) but ${why}`]);
      });

      // Every case so far has been better served by moving the file, and the table's doc comment says so
      it('is empty in this repo, and every entry it ever holds still applies', () => {
        expect([...DECLARES_SOURCE_BY_DESIGN.keys()]).toEqual([]);
        expect(findMissingSourceConditions()).toEqual([]);
      });
    });
  });

  it('holds for the repo', () => {
    expect(findMissingSourceConditions()).toEqual([]);
  });
});
