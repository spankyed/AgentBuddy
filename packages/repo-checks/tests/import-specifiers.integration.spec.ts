import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHECKS,
  findAppImportsInPackTests, findContractLeafImports, findCrossCheckoutResolution, findCrossFeatureImports, findExtensionlessOwnModules, findHostImports, findJsSpecifiers, findMissingSourceConditions,
  findPackageScriptImports, findPackBackendConsole, findPackOwnAliases, findRawPackHelpers,
  findRawTransport, findInternalPackageImports, findLmdbImports, findRepositoryCasts, findSharedPackageLists, findUpwardImports, LAYERS, LMDB_RULES, packageSourceDirs,
  CHECK_IDS, DECLARES_SOURCE_BY_DESIGN, type ImportRuleId, RESOLVES_DIST_BY_DESIGN, SHARED_LIST_CONSUMERS, sourceConditionPackages, SOURCE_CONDITION,
  checkedDirs, type ImportRule, packCodeDirs, packDirs, packRule,
} from '../../../scripts/check-import-specifiers.ts';
import { REPO_ROOT } from '@abuddy/host/build/packages-built';
import { packFixture as buildPackFixture } from '@abuddy/host/testing/pack-fixture';

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

/**
 * The subpath map a pack fixture declares, which is how a pack names its own modules: `abuddy init` writes one and
 * every own-module specifier in this repo's packs is one. `@/` is not an alternative to it — `findPackOwnAliases`
 * below and the CLI's `pack-own-aliases` both refuse one — so no fixture here writes that spelling except the cases
 * whose subject it is.
 */
const PACK_IMPORTS = { '#features/*': './src/features/*', '#generated/*': './src/__generated__/*' };

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
});

/** Code none of the pack rules flag: comments, string text and the allowed imports */
const ALLOWED = [
  "// import { untypedBroadcastToPlugin } from '@abuddy/sdk/events'; _rootEvents; trpc.bus; console.log('x')",
  "/* import * as events from '@abuddy/sdk/events'; console.log('x') */",
  "const url = 'https://console.anthropic.com/settings/keys';",
  "const prompt = `_rootEvents.emitOutgoing(event); console.log(ev.type)`;",
  "import { untypedBroadcastToPlugin, untypedSendToSystem } from '#generated/events';",
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
      "import { importCompiledSeeds, getDataDirPath } from '@abuddy/sdk/utils';",
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
    ["import { untypedBroadcastToPlugin as toPlugin } from '@abuddy/sdk/events';", 'untypedBroadcastToPlugin from @abuddy/sdk/events'],
    ["import onConnected, { untypedSendToSystem } from '@abuddy/sdk/events';", 'untypedSendToSystem from @abuddy/sdk/events'],
    ["import { untypedBroadcastToPlugin, services } from '@abuddy/sdk/services';", 'untypedBroadcastToPlugin from @abuddy/sdk/services'],
    ["import { registerRepository, untypedTx } from '@abuddy/ears';", 'registerRepository from @abuddy/ears'],
    ["import { unregisterRepository } from '@abuddy/ears';", 'unregisterRepository from @abuddy/ears'],
    ["export type { untypedBroadcastToPlugin } from '@abuddy/sdk/events';", 'untypedBroadcastToPlugin from @abuddy/sdk/events'],
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
    write('pack/Widget.vue', "<template><pre>import { untypedBroadcastToPlugin } from '@abuddy/sdk/events'</pre></template>\n<script setup lang=\"ts\">\n\nimport { untypedBroadcastToPlugin } from '@abuddy/sdk/events';\n</script>\n");
    expect(findRawPackHelpers(['src/pack'], root)).toEqual(['src/pack/Widget.vue:4: untypedBroadcastToPlugin from @abuddy/sdk/events']);
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
});

/**
 * Read from the syntax tree, since the rule became the pack rule `abuddy build` runs (`goal-one-rule-set.md`).
 * The case this used to have for a specifier inside a template literal is gone with its subject: the CLI's
 * templates are files now, and in a pack's own source a string that looks like an import is a string.
 */
describe('findHostImports', () => {
  it.each([
    ["import { edgeStore } from '@abuddy/host/ears';", '@abuddy/host/ears'],
    ["import type { PackRegistration } from '@abuddy/host/packs';", '@abuddy/host/packs'],
    ["export { hydrate } from '@abuddy/host/ears';", '@abuddy/host/ears'],
    ["const backup = await import('@abuddy/host/backup');", '@abuddy/host/backup'],
    ["const { envs } = require('@abuddy/host/ears');", '@abuddy/host/ears'],
    ["import '@abuddy/host';", '@abuddy/host'],
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
    ["const { init } = await import('../../../abuddy-cli/src/commands/init');", '../../../abuddy-cli/src/commands/init'],
    ["import { installPackFromLocal } from '../../../abuddy-host/src/packs/pack-installer';", '../../../abuddy-host/src/packs/pack-installer'],
  ])('flags %s', (code, specifier) => {
    write('pack-tests/unit/feature.spec.ts', code);
    expect(findAppImportsInPackTests(['src/pack-tests'], root)).toEqual([`src/pack-tests/unit/feature.spec.ts:1: ${specifier}`]);
  });

  /**
   * The two shapes this rule used to claim as well, each with the rule that owns it wherever a pack writes it.
   * One import reported by two rules is how only the first to run gets read, and these also say what is left for
   * this one: a relative path into the app's sources, which no pack outside this repo can write.
   *
   * The second assertion in each is the narrowing; the first is what makes dropping it safe, since `abuddy test`
   * runs both of those rules over a pack's tests.
   */
  it("leaves @abuddy/host in a pack's test to host-imports", () => {
    write('pack-tests/unit/feature.spec.ts', "import { hydrate } from '@abuddy/host/ears';");
    expect(findHostImports(['src/pack-tests'], root)).toEqual(['src/pack-tests/unit/feature.spec.ts:1: @abuddy/host/ears']);
    expect(findAppImportsInPackTests(['src/pack-tests'], root)).toEqual([]);
  });

  it("leaves a @/ specifier in a pack's test to pack-own-aliases", () => {
    write('pack-tests/unit/feature.spec.ts', "import { openAppStore } from '@/setup/backend';");
    expect(findPackOwnAliases(['src/pack-tests'], root)).toEqual(['src/pack-tests/unit/feature.spec.ts:1: @/setup/backend']);
    expect(findAppImportsInPackTests(['src/pack-tests'], root)).toEqual([]);
  });

  it('allows the SDK, the harness and the pack itself', () => {
    write('pack-tests/unit/feature.spec.ts', [
      "import { untypedQx } from '@abuddy/ears';",
      "import { startApp } from '@abuddy/testing/harness';",
      "import { repository } from '#generated/repository.ts';",
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
      'src/index.ts': "import { untypedTx } from '@abuddy/ears';\nexport type { Q } from '@abuddy/ears/lmdb';\nexport * from '@abuddy/sdk/events';\n",
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
    write('packages/default-setup/src/features/notes/be/system.ts', "import { untypedTx } from '@abuddy/ears';\n");
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
      "import { untypedTx } from '@abuddy/ears';",
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

/**
 * Every rule in `CHECKS` is a gate that fails the build, so every one needs a case that proves it bites.
 *
 * This used to be that sentence and nothing else: the file imported `CHECKS` and never read it, so the
 * convention was held up by whoever remembered it — and two rules had landed with no case at all
 * (`findPackOwnAliases`, `findPackageScriptImports`), which is exactly what the sentence promised could not
 * happen. Same shape as `step-build-barrel.spec.ts`: a table and its uses, kept in step by a test.
 */
/**
 * One offending example per rule in `CHECKS`, and the call that runs the rule over it.
 *
 * Every rule there is a gate that fails the build, so every one needs a case that proves it bites — and the
 * two attempts before this one read the *spec* instead of running the rules. The first asked whether a
 * `describe` block existed, which the own-module rule satisfied while half of it was asserted nowhere. The
 * second parsed this file and asked what each block's assertions looked like, which `expect([1]).toEqual([1])`
 * inside a well-named `describe` would have satisfied, and which called `findSharedPackageLists` uncovered
 * because its cases build their expected list instead of writing it out.
 *
 * So this runs each rule against input written to make it speak. The table is keyed by the rule's function
 * name and checked against `CHECKS` in both directions, so a rule added without an example fails here, and an
 * example left behind by a deleted rule fails too. The per-rule `describe` blocks above cover the nuances:
 * what each rule allows, the line it reports, the forms it reads. This covers one thing, for all of them.
 */
/**
 * The tree every pack-code rule's example sits in: a package that is also a pack, which is what
 * `packages/default-setup` is — so the rules whose population is `packages/*` and the rules whose population is a
 * pack's halves can be pointed at the same directory.
 *
 * One shape, because there used to be two and the difference was invisible. A fixture at `src/pack` has no
 * `package.json` and no `abuddy.json`, so `own-modules` (which needs the `imports` map) and `contract-leaves`
 * (which needs the manifest) **cannot fire there at all** — measured. Half the sweep's fixtures were that shape,
 * so for those rows those two rules' "and no other rule claims it" said nothing: they were not able to claim.
 *
 * The base is clean, asserted below, so a sweep attributes nothing to the tree it runs in.
 */
const PACK_FIXTURE = 'packages/demo-pack';
const PACK_SRC = [`${PACK_FIXTURE}/src`];
const PACK_TESTS = [`${PACK_FIXTURE}/tests`];

/** The shared complete pack, written where these rules' populations look for one */
function packFixture(files: Record<string, string> = {}): void {
  buildPackFixture({ at: path.join(root, PACK_FIXTURE), files });
}

/** The same table read by id-as-a-string, for the sweeps, which derive their ids from the widened `CHECKS` */
const exampleFor = (id: string): (() => string[]) | undefined =>
  (FIRES as Record<string, () => string[]>)[id];

const FIRES: Record<ImportRuleId, () => string[]> = {
  findJsSpecifiers: () => {
    write('f.ts', "import { q } from './query.js';");
    return findJsSpecifiers(['src'], root);
  },
  findRawPackHelpers: () => {
    packFixture({ 'src/f.ts': "import { untypedSendToSystem } from '@abuddy/sdk/events';" });
    return findRawPackHelpers(PACK_SRC, root);
  },
  findInternalPackageImports: () => {
    packFixture({ 'src/f.ts': "import { _getMediaPath } from '@abuddy/sdk/utils';" });
    return findInternalPackageImports(PACK_SRC, root);
  },
  findRawTransport: () => {
    packFixture({ 'src/f.ts': '_rootEvents.emitOutgoing(event);' });
    return findRawTransport(PACK_SRC, root);
  },
  findPackBackendConsole: () => {
    packFixture({ 'src/features/notes/be/system.ts': "console.log('seeded');" });
    return findPackBackendConsole(PACK_SRC, root);
  },
  findHostImports: () => {
    packFixture({ 'src/f.ts': "import { edgeStore } from '@abuddy/host/ears';" });
    return findHostImports(PACK_SRC, root);
  },
  findPackOwnAliases: () => {
    packFixture({ 'src/f.ts': "import { x } from '@/features/notes/be/x.ts';" });
    return findPackOwnAliases(PACK_SRC, root);
  },
  findExtensionlessOwnModules: () => {
    packFixture({ 'src/f.ts': "import { sendToSystem } from '#generated/events';" });
    return findExtensionlessOwnModules(PACK_SRC, root);
  },
  findAppImportsInPackTests: () => {
    packFixture({ 'tests/unit/feature.spec.ts': "import { hydrate } from '../../../abuddy-host/src/database/store';" });
    return findAppImportsInPackTests(PACK_TESTS, root);
  },
  findUpwardImports: () => {
    const layers = LAYERS.map((l) => ({ ...l, dir: `layers/${path.basename(l.dir).replace(/^abuddy-/, '')}` }));
    // Every layer has to be there, since the rule walks all of them; only the lowest one imports upward
    for (const { dir } of layers) layer(dir, {}, {});
    layer('layers/ears', {}, { 'src/index.ts': "import { services } from '@abuddy/sdk/services';\n" });
    return findUpwardImports(layers, root);
  },
  findLmdbImports: () => {
    const rules = LMDB_RULES.map((rule) => ({
      ...rule,
      dirs: rule.dirs.map((dir) => `src/${dir}`),
      except: rule.except && `src/${rule.except}`,
    }));
    write('packages/abuddy-host/src/services/trace-store.ts', "import { open } from 'lmdb';");
    return findLmdbImports(rules, root);
  },
  findSharedPackageLists: () => {
    write('consumer.ts', "const EXTERNALS = ['@abuddy/sdk'];");
    return findSharedPackageLists(['src/consumer.ts'], root);
  },
  findRepositoryCasts: () => {
    packFixture({ 'src/f.ts': 'const notes = repository as unknown as Repositories;' });
    return findRepositoryCasts(PACK_SRC, root);
  },
  findCrossFeatureImports: () => {
    packFixture({ 'src/extensions/viewer.ts': "import List from '../features/notes/fe/canvas/list.vue';" });
    return findCrossFeatureImports(PACK_SRC, root);
  },
  findContractLeafImports: () => {
    packFixture({ 'src/features/notes/fe/contract.ts': "import type { P } from './plugin';" });
    return findContractLeafImports(PACK_SRC, root);
  },
  findPackageScriptImports: () => {
    writeAt('packages/thing/package.json', JSON.stringify({ name: '@abuddy/thing' }));
    writeAt('packages/thing/scripts/build.ts', "import { x } from '../../../scripts/lib/x.ts';");
    return findPackageScriptImports(root);
  },
  findCrossCheckoutResolution: () => {
    // A worktree nested in the repository: its own build output is missing, so TypeScript keeps walking up
    // and resolves the package to the parent checkout's
    const outer = path.join(root, 'outer');
    const inner = path.join(outer, 'nested', 'worktree');
    for (const checkout of [outer, inner]) {
      writeAt(path.relative(root, path.join(checkout, 'package.json')), JSON.stringify({ name: 'root', workspaces: ['packages/*'] }));
      writeAt(path.relative(root, path.join(checkout, 'packages', 'api', 'package.json')), JSON.stringify({ name: '@app/api', types: 'dist/types.d.ts' }));
      fs.mkdirSync(path.join(checkout, 'node_modules', '@app'), { recursive: true });
      fs.symlinkSync(path.join(checkout, 'packages', 'api'), path.join(checkout, 'node_modules', '@app', 'api'), 'dir');
    }
    writeAt(path.relative(root, path.join(outer, 'packages', 'api', 'dist', 'types.d.ts')), 'export {};\n');
    return findCrossCheckoutResolution(inner);
  },
  findMissingSourceConditions: () => {
    workspace();
    writeAt('packages/consumer/tsconfig.json', '{ "compilerOptions": { "strict": true } }');
    return conditionProblems();
  },
};

/**
 * Which half of a pack a rule's declared population reads, taken from `over` rather than a list written here.
 *
 * This is what makes the sweeps below cover whoever arrives: a rule that reads a pack's `src` is swept there, one
 * that reads its `tests` is swept there, and one whose population holds no pack dir at all — `findJsSpecifiers`,
 * whose subject is the packages that are *not* packs — takes part in neither, which is the exclusion its own
 * disjointness case asserts from the other side.
 */
const readsPackHalf = (rule: ImportRule, half: 'src' | 'tests'): boolean =>
  (rule.over ?? []).some((dir) => path.basename(dir) === half && packDirs().includes(path.dirname(dir)));

/** The rules a sweep over `half` runs: the ones that read it and can be pointed at a directory */
const sweepers = (half: 'src' | 'tests'): readonly ImportRule[] =>
  CHECKS.filter((rule) => readsPackHalf(rule, half) && rule.overPaths !== undefined);

/** Every rule but `id` that also claims the offence sitting in `dirs` */
const alsoClaiming = (id: string, dirs: readonly string[], half: 'src' | 'tests'): string[] =>
  sweepers(half).filter((rule) => rule.id !== id && rule.overPaths!([...dirs], root).length > 0).map((rule) => rule.id);


describe('CHECKS', () => {
  /**
   * That each rule *fires* — the half a type cannot state. `FIRES` is keyed by `ImportRuleId`, derived from
   * `CHECKS`, so a rule with no example and an example for a rule that is gone are both compile errors now,
   * naming the id and suggesting the one it meant. What is left here is the assertion that the example is not a
   * fiction: a gate with no case that makes it speak is a gate nothing has watched fail.
   */
  it.each(CHECK_IDS)('%s flags an offending example', (name) => {
    expect(FIRES[name](), `${name} found nothing in a tree written to offend it`).not.toEqual([]);
  });

  /**
   * And no offence claimed twice. This is the bug that hid behind the old runner: a relative `.js` in pack code
   * was reported by both `findJsSpecifiers` and the own-module rule, and since the runner exited on the first
   * failure, only one was ever read. Resolved by narrowing `findJsSpecifiers` to the packages, where there is
   * no `imports` map to resolve against — and asserted here so the next overlap fails instead of hiding.
   *
   * Bounded by the examples, honestly: it runs the pack-code rules over each pack-code fixture, which is where
   * the overlap was. A rule that reads the whole tree cannot be pointed at a fixture (its scope is the repo's
   * layers, configs and exception lists), so it is not in this sweep.
   *
   * **Every pack-backed rule is a row.** The sweep is what `check-import-specifiers.ts` cites for running one rule
   * at a time, so a rule the CLI owns that is missing here makes that claim wider than the sweep — which is what
   * `cross-feature-imports` and `contract-leaves` did on arriving.
   */
  it.each([...sweepers('src')].map((rule) => rule.id))('%s claims its own example and no other pack rule does', (id) => {
    expect(exampleFor(id)!(), `${id} must fire on its own example`).not.toEqual([]);
    expect(alsoClaiming(id, PACK_SRC, 'src'),
      `${id}'s offence is also reported by these, so only the first to run is ever read`).toEqual([]);

    // And the key the entry declares is the rule that fires. `backed(id, key, find, over)` takes the key twice
    // over — once as `key`, which picks the sentence printed above the findings, and once inside `find`, which is
    // what actually runs — so a mismatch prints one rule's wording over another rule's offences. Nothing else
    // notices: the ownership guard below asks only that a key is declared, not that it is this one.
    //
    // Only for a rule the CLI owns. The sweep's subjects are derived from what each rule reads, and a repo-only
    // rule is swept for the same ownership property while having no key to check — `findRepositoryCasts` is one,
    // and requiring a key of it failed the moment the derivation brought it in.
    const declared = CHECKS.find((rule) => rule.id === id)?.packRule;
    if (declared === undefined) return;
    expect(packRule(declared, PACK_SRC, root),
      `${id} declares \`${declared}\`, which finds nothing in a tree written to offend ${id}: the key it names is `
      + 'not the rule it runs, so its findings print under the wrong sentence').not.toEqual([]);
  });

  /**
   * `findJsSpecifiers` is not in that sweep, and this is why: it and the own-module rule report the same
   * relative `.js`, and what keeps them apart is not the finding but the *population* — packages that are not
   * packs, against packs. A fixture directory plays both roles at once, so both fire there; in the repo they
   * cannot, and that is the property worth asserting. `packages/default-setup` is the case that matters: it is
   * a package *and* a pack, and before the exclusion both rules reported its every `.js` with only the first
   * printed.
   */
  it('gives findJsSpecifiers and the own-module rule disjoint populations', () => {
    const packs = packDirs();
    expect(packs, 'the packs are derived from where a manifest is, so this should never be empty').not.toEqual([]);
    const overlap = checkedDirs().filter((dir) => packs.some((pack) => dir === pack || dir.startsWith(`${pack}/`)));
    expect(overlap, 'a pack\'s own code belongs to own-modules, which names the file to write').toEqual([]);
  });


  /**
   * The population a rule about a pack's own code reads. A rule that covered `src` alone was narrower in this repo
   * than the same rule is for a pack, since `abuddy test` runs the set over a pack's `tests` — which is how
   * `@abuddy/host` in a pack's test came to be reported by a third rule instead of the one that owns it.
   */
  it("covers every pack's src and its tests", () => {
    const packs = packDirs();
    expect(packs, 'the packs are derived from where a manifest is, so this should never be empty').not.toEqual([]);
    const missing = packs.flatMap((pack) => ['src', 'tests']
      .filter((half) => fs.existsSync(path.join(REPO_ROOT, pack, half)) && !packCodeDirs().includes(`${pack}/${half}`))
      .map((half) => `${pack}/${half}`));
    expect(missing, 'a pack half that exists and is not in the population is a tree no such rule reads').toEqual([]);
  });

  /**
   * The one shape two pack rules are both right about, and the two consumers answer differently on purpose.
   *
   * `abuddy validate` runs every rule together, so its dedupe gives a pack author one message — asserted in
   * `abuddy-cli/tests/build/pack-rules.spec.ts`. `packRule` here runs one rule at a time, because `--rule <id>`
   * has to answer for that rule alone and an answer that depended on which other rules ran would not be one. So
   * this side reports both, and that is the difference, not a bug: pinned so nobody 'fixes' one to match the other.
   */
  it('reports a leaf reaching another feature under both rules, running one rule at a time', () => {
    writeAt('pack/abuddy.json', JSON.stringify({
      id: 'demo-pack', name: 'Demo', version: '1.0.0',
      features: [{ id: 'notes', plugin: { entry: 'src/features/notes/fe/plugin.ts', contract: 'src/features/notes/fe/contract.ts#Contract' } }],
    }));
    writeAt('pack/src/features/notes/fe/contract.ts', "import type { T } from '../../threads/fe/state.ts';\nexport type Contract = { state: { t: T } };");
    writeAt('pack/src/features/notes/fe/plugin.ts', 'export type P = { id: string };');
    writeAt('pack/src/features/threads/fe/state.ts', 'export type T = { id: string };');
    const offence = 'pack/src/features/notes/fe/contract.ts:1: ../../threads/fe/state.ts';
    expect(findContractLeafImports(['pack/src'], root)).toEqual([offence]);
    expect(findCrossFeatureImports(['pack/src'], root)).toEqual([offence]);
  });

  /**
   * What makes the sweep above mean anything: the tree it runs in offends nobody, so a claim it reports came from
   * the case's own offending file. Without this, a base that tripped a rule would look like every other rule
   * double-claiming every offence.
   */
  it('offends no rule before a case adds an offence', () => {
    packFixture();
    const claimed = [...sweepers('src')].filter((rule) => rule.overPaths!(PACK_SRC, root).length > 0).map((rule) => rule.id);
    expect(claimed, 'the shared fixture is not clean, so a sweep attributes its noise to whichever rule it is sweeping').toEqual([]);
  });

  /** And every rule that reads a pack's src is swept, derived from what each declares rather than listed here */
  it("sweeps every rule that reads a pack's src", () => {
    const swept = [...sweepers('src')].map((rule) => rule.id);
    expect(swept.length, 'no rule declares a population holding a pack\'s src, so the sweep runs over nothing').toBeGreaterThan(5);
    expect(swept.filter((id) => exampleFor(id) === undefined),
      'a swept rule with no offending example in FIRES cannot be checked for double-claiming').toEqual([]);
  });

  /**
   * The other population, and nothing swept it: `abuddy test` runs the whole rule set over a pack's `tests`
   * (`refusePackRuleViolations(cwd, TEST_DIRS)`), so an offence there has an owner exactly as one in `src` does.
   * Three rules claimed `@abuddy/host` in a pack's test until `f04775d70`, and this is the case that would have
   * said so — the fixtures live in `tests/`, where a src sweep cannot reach.
   */
  it.each([
    ['@abuddy/host', "import { hydrate } from '@abuddy/host/ears';", 'findHostImports'],
    ['a @/ alias', "import { openAppStore } from '@/setup/backend';", 'findPackOwnAliases'],
    ['an @internal export', "import { _getMediaPath } from '@abuddy/sdk/utils';", 'findInternalPackageImports'],
    ['the app by relative path', "import { hydrate } from '../../../abuddy-host/src/database/store';", 'findAppImportsInPackTests'],
    ['an extensionless own module', "import { sendToSystem } from '#generated/events';", 'findExtensionlessOwnModules'],
  ])("in a pack's tests, %s is claimed by exactly one rule", (_shape, code, owner) => {
    packFixture({ 'tests/unit/feature.spec.ts': code });
    const claimed = [...sweepers('tests')].filter((rule) => rule.overPaths!(PACK_TESTS, root).length > 0).map((rule) => rule.id);
    expect(claimed, 'one offence, one owner — in a pack\'s tests as in its src').toEqual([owner]);
  });
});

/**
 * A pack names its own modules by the file that is there. Two forms fail the same way — nothing, and the
 * `.js` a pack never emits — so they get one rule and one message, and the search that names the file the
 * author meant is the one `abuddy build` runs over every pack outside this checkout.
 */
describe('findExtensionlessOwnModules', () => {
  /** A pack with an `imports` map, which is what makes a `#` string a specifier rather than a colour */
  function pack(files: Record<string, string>): void {
    writeAt('pack/package.json', JSON.stringify({ name: 'p', type: 'module', imports: { '#generated/*': './src/__generated__/*' } }));
    writeAt('pack/src/__generated__/events.ts', 'export const sendToSystem = 1;');
    for (const [file, content] of Object.entries(files)) writeAt(`pack/${file}`, content);
  }
  const problems = () => findExtensionlessOwnModules(['pack/src', 'pack/tests'], root);

  it.each([
    ['extensionless', '#generated/events'],
    ['the emitted extension of a TypeScript module', '#generated/events.js'],
  ])('flags a specifier naming no file: %s', (_form, specifier) => {
    pack({ 'src/f.ts': `import { sendToSystem } from '${specifier}';` });
    expect(problems()).toEqual([`pack/src/f.ts:1: '${specifier}' names no file — write '#generated/events.ts'`]);
  });

  it('passes the form that names the file, in the pack and in its tests', () => {
    pack({
      'src/f.ts': "import { sendToSystem } from '#generated/events.ts';",
      'tests/f.spec.ts': "import { sendToSystem } from '#generated/events.ts';",
    });
    expect(problems()).toEqual([]);
  });

  it('reads a pack authored in JavaScript, which nothing requires a pack not to be', () => {
    writeAt('pack/package.json', JSON.stringify({ name: 'p', type: 'module', imports: { '#generated/*': './src/__generated__/*' } }));
    writeAt('pack/src/__generated__/events.ts', 'export const a = 1;');
    writeAt('pack/src/f.js', "import { a } from '#generated/events';");
    expect(findExtensionlessOwnModules(['pack/src'], root))
      .toEqual(["pack/src/f.js:1: '#generated/events' names no file — write '#generated/events.ts'"]);
  });

  it('names a .json target, which a bundler resolves and Node wants an attribute for', () => {
    writeAt('pack/package.json', JSON.stringify({ name: 'p', type: 'module', imports: { '#data/*': './src/data/*' } }));
    writeAt('pack/src/data/providers.json', '{}');
    writeAt('pack/src/f.ts', "import providers from '#data/providers';");
    expect(findExtensionlessOwnModules(['pack/src'], root))
      .toEqual(["pack/src/f.ts:1: '#data/providers' names no file — write '#data/providers.json'"]);
  });
});

/**
 * `@/…` is a TypeScript-only mapping: it resolved for `tsc` and for four bundler configs that each carried
 * their own implementation of it, all of which are gone. A reintroduced one fails quietly, which is why the
 * rule exists.
 */
describe('findPackOwnAliases', () => {
  it('flags a @/ specifier in a pack, and passes the # form', () => {
    writeAt('pack/src/a.ts', "import { x } from '@/features/notes/be/x.ts';");
    writeAt('pack/src/b.ts', "import { y } from '#features/notes/be/y.ts';");
    expect(findPackOwnAliases(['pack/src'], root)).toEqual(['pack/src/a.ts:1: @/features/notes/be/x.ts']);
  });

  /**
   * This rule owns the spelling, and for a long time it was not the only rule that reacted to one: the two that
   * walk a pack's own imports *resolved* `@/` — a spelling this rule and the CLI's `pack-own-aliases` both refuse —
   * and their fixtures were written in it, so every test was green while both were blind to the `#` subpaths the
   * packs write. They resolve through one `packTargetOf` now, and this is the pair of halves: what refuses the
   * spelling reports it, and what resolves specifiers does not resolve it at all.
   */
  it('is the only rule that reacts to one, the resolvers skipping it', () => {
    writeAt('pack/abuddy.json', JSON.stringify({
      id: 'demo-pack', name: 'Demo', version: '1.0.0',
      features: [{ id: 'notes', plugin: { contract: 'src/features/notes/fe/contract.ts#Contract' } }],
    }));
    writeAt('pack/src/features/notes/fe/contract.ts', "import type { P } from '@/__generated__/fe';");
    writeAt('pack/src/features/code/fe/panel.ts', "import { id } from '@/features/notes/fe/state';");
    expect(findPackOwnAliases(['pack/src'], root).sort()).toEqual([
      'pack/src/features/code/fe/panel.ts:1: @/features/notes/fe/state',
      'pack/src/features/notes/fe/contract.ts:1: @/__generated__/fe',
    ]);
    expect(findCrossFeatureImports(['pack/src'], root)).toEqual([]);
    expect(findContractLeafImports(['pack/src'], root)).toEqual([]);
  });
});

/**
 * A module under the repo's `scripts/` belongs to no package, so `npm run spec` cannot route a change to it
 * back to the spec that covers it — a package's own `scripts/` therefore stays inside the package and its
 * declared dependencies.
 */
describe('findPackageScriptImports', () => {
  /** A package with a scripts/ directory, which is the only shape this rule looks at */
  function pkg(deps: Record<string, string>, files: Record<string, string>): void {
    writeAt('packages/thing/package.json', JSON.stringify({ name: '@abuddy/thing', dependencies: deps }));
    writeAt('packages/thing/src/own.ts', 'export const own = 1;');
    for (const [file, content] of Object.entries(files)) writeAt(`packages/thing/${file}`, content);
  }

  it('passes the package\'s own source, a declared dependency and a builtin', () => {
    pkg({ esbuild: '*' }, { 'scripts/build.ts': "import { own } from '../src/own.ts';\nimport * as fs from 'node:fs';\nimport esbuild from 'esbuild';" });
    expect(findPackageScriptImports(root)).toEqual([]);
  });

  it('flags a reach outside the package and an undeclared dependency', () => {
    pkg({}, { 'scripts/build.ts': "import { x } from '../../../scripts/lib/x.ts';\nimport { y } from '@abuddy/host/build/discover';" });
    expect(findPackageScriptImports(root)).toEqual([
      'packages/thing/scripts/build.ts:1: ../../../scripts/lib/x.ts',
      'packages/thing/scripts/build.ts:2: @abuddy/host/build/discover',
    ]);
  });
});
/**
 * A contract leaf is what codegen reads a feature's events and state from, as a declared type, without resolving
 * the actor they describe. `#generated/events` imports both contracts and both actors import `#generated/events`,
 * so a leaf that can reach its actor closes that cycle — which is why the rule is a closure walk and not a check
 * of the leaf's own imports.
 *
 * The fixture is a pack, `abuddy.json` included: that file is what makes a tree a pack, and a fixture without one
 * isn't testing the thing the rule runs on.
 */
describe('findContractLeafImports', () => {
  const src = 'pack/src';
  /** A pack whose `notes` feature names both contracts, as a real manifest does, with the subpath map a pack has */
  function pack(files: Record<string, string>): void {
    const under = Object.fromEntries(Object.entries(files).map(([file, content]) => [`src/${file}`, content]));
    buildPackFixture({ at: path.join(root, 'pack'), files: under });
  }

  it('allows a leaf that names only its own types and the generated leaves', () => {
    pack({
      'features/notes/fe/contract.ts': [
        "import type { NoteDTO } from '../be/types';",
        "import type { EARS } from '#generated/ears.ts';",
        "import type { X } from '#generated/types.ts';",
      ].join('\n'),
      'features/notes/be/contract.ts': "import type { Incoming } from './types';",
      'features/notes/be/types.ts': 'export type Incoming = { type: "A" };',
    });
    expect(findContractLeafImports([src], root)).toEqual([]);
  });

  /**
   * The plugin and system definitions, which the manifest names outright. The machine rule beside this one is a
   * guess at a filename — no manifest field names the machine, since `Plugin.state` is a value — so `./plugin`
   * matched nothing before this, and a leaf importing it was reported only as whatever its closure reached.
   */
  it("flags a leaf that imports an entry abuddy.json names, whatever the file is called", () => {
    pack({
      'features/notes/fe/contract.ts': "import type { P } from './plugin';",
      'features/notes/be/contract.ts': 'export type Contract = { outgoing: { type: "A" } };',
      'features/notes/fe/plugin.ts': 'export type P = { id: string };',
    });
    expect(findContractLeafImports([src], root)).toEqual([`${src}/features/notes/fe/contract.ts:1: ./plugin`]);
  });

  // It is the entry's path that matters, not its name: a pack whose machine is `machine.ts` is caught the same way
  it('flags an entry the manifest names under an unconventional filename', () => {
    writeAt('pack/abuddy.json', JSON.stringify({
      id: 'demo-pack', name: 'Demo', version: '1.0.0',
      features: [{
        id: 'notes',
        plugin: { entry: 'src/features/notes/fe/machine.ts', contract: 'src/features/notes/fe/contract.ts#Contract' },
      }],
    }));
    writeAt(`${src}/features/notes/fe/contract.ts`, "import type { M } from './machine';");
    writeAt(`${src}/features/notes/fe/machine.ts`, 'export type M = { id: string };');
    expect(findContractLeafImports([src], root)).toEqual([`${src}/features/notes/fe/contract.ts:1: ./machine`]);
  });

  // Each side's machine: a plugin's is fe/state, a system's is be/system, and both import #generated/events.
  // The rule resolves what it reads, so the machines have to exist for the import to be one.
  it("flags a leaf that reaches its own feature's machine", () => {
    pack({
      'features/notes/fe/contract.ts': "import type { Ctx } from './state';",
      'features/notes/fe/state.ts': "import { sendToPlugin } from '#generated/events.ts';",
      'features/notes/be/contract.ts': "import type { Ev } from './system';",
      'features/notes/be/system.ts': "import { untypedBroadcastToPlugin } from '#generated/events.ts';",
    });
    expect(findContractLeafImports([src], root).sort()).toEqual([
      `${src}/features/notes/be/contract.ts:1: ./system`,
      `${src}/features/notes/fe/contract.ts:1: ./state`,
    ]);
  });

  it('flags a leaf that names another feature', () => {
    pack({
      'features/notes/fe/contract.ts': "import type { T } from '#features/threads/be/types.ts';",
      'features/threads/be/types.ts': 'export type T = { id: string };',
      'features/notes/be/contract.ts': 'export type Contract = { outgoing: { type: "A" } };',
    });
    expect(findContractLeafImports([src], root)).toEqual([`${src}/features/notes/fe/contract.ts:1: #features/threads/be/types.ts`]);
  });

  it('flags a generated module that is not a leaf itself', () => {
    pack({
      'features/notes/fe/contract.ts': "import type { P } from '#generated/fe.ts';",
      'features/notes/be/contract.ts': "import { untypedBroadcastToPlugin } from '#generated/events.ts';",
    });
    expect(findContractLeafImports([src], root).sort()).toEqual([
      `${src}/features/notes/be/contract.ts:1: #generated/events.ts`,
      `${src}/features/notes/fe/contract.ts:1: #generated/fe.ts`,
    ]);
  });

  /**
   * The rule that matters, and the one a check of the leaf's own imports would miss: the cycle returns just as
   * surely through two hops. This is the shape that was live in default-setup's code feature — its contract
   * imported its child modules, and those import `#generated/events` for `untypedBroadcastToPlugin`.
   */
  it('flags #generated/events reached through the closure, naming the leaf it came from', () => {
    pack({
      'features/notes/be/contract.ts': "import type { Ev } from './children/list';",
      'features/notes/be/children/list.ts': "import { untypedBroadcastToPlugin } from '#generated/events.ts';",
      'features/notes/fe/contract.ts': 'export type Contract = { state: {} };',
    });
    expect(findContractLeafImports([src], root)).toEqual([
      `${src}/features/notes/be/children/list.ts:1: #generated/events.ts (reached from ${src}/features/notes/be/contract.ts)`,
    ]);
  });

  /**
   * Deeper in the closure only the five generated modules a contract is behind matter: a module the leaf reaches may
   * use the rest of the generated code. `repository` is the case that fixes which way round it is — it *does* reach a
   * contract, through a feature's repository index, as twelve of default-setup's sixteen generated modules do, and is
   * allowed anyway, because what the rule is about is the three codegen generates *from* a contract and the two that
   * import the machines.
   */
  it('allows a generated module no contract is behind deeper in the closure', () => {
    pack({
      'features/notes/be/contract.ts': "import type { Ev } from './children/list';",
      'features/notes/be/children/list.ts': "import { repository } from '#generated/repository.ts';",
      'features/notes/fe/contract.ts': 'export type Contract = { state: {} };',
    });
    expect(findContractLeafImports([src], root)).toEqual([]);
  });

  /**
   * The other three, which the closure branch listed `events` and `fe` alone against until this case. `system-specs`
   * is the module in the middle of the cycle the origin commit documents — `events` reads each system's contract
   * through it — and the two pack entries import the machines, which is the cost half of the rule. Nothing in either
   * pack imports any of the three from source today: the case is here so the list matches the property stated on
   * `GENERATED_BEHIND_A_CONTRACT`, not because something reaches them now.
   */
  it('flags the other generated modules a contract is behind, reached through the closure', () => {
    pack({
      'features/notes/be/contract.ts': "import type { A } from './children/one';\nimport type { B } from './children/two';",
      'features/notes/be/children/one.ts': "import type { A } from '#generated/system-specs.ts';",
      'features/notes/be/children/two.ts': "import type { B } from '#generated/pack-entry.ts';\nimport type { C } from '#generated/pack-entry-fe.ts';",
      'features/notes/fe/contract.ts': 'export type Contract = { state: {} };',
    });
    const from = `(reached from ${src}/features/notes/be/contract.ts)`;
    expect(findContractLeafImports([src], root).sort()).toEqual([
      `${src}/features/notes/be/children/one.ts:1: #generated/system-specs.ts ${from}`,
      `${src}/features/notes/be/children/two.ts:1: #generated/pack-entry.ts ${from}`,
      `${src}/features/notes/be/children/two.ts:2: #generated/pack-entry-fe.ts ${from}`,
    ]);
  });

  /**
   * A hop that is itself a `#features/` import, which is what the walk could not follow until `mappedPathFor`
   * resolved the pack's map: two of `default-setup`'s contract closures ended at one, one of them
   * `threads/be/types.ts` reaching into `code/`, so nothing past that hop was checked at all.
   */
  it('follows a #features/ hop to #generated/events deeper in the closure', () => {
    pack({
      'features/notes/be/contract.ts': "import type { Ev } from './types.ts';",
      'features/notes/be/types.ts': "import type { H } from '#features/threads/be/helper.ts';\nexport type Ev = H;",
      'features/threads/be/helper.ts': "import { untypedBroadcastToPlugin } from '#generated/events.ts';\nexport type H = typeof untypedBroadcastToPlugin;",
      'features/notes/fe/contract.ts': 'export type Contract = { state: {} };',
    });
    expect(findContractLeafImports([src], root)).toEqual([
      `${src}/features/threads/be/helper.ts:1: #generated/events.ts (reached from ${src}/features/notes/be/contract.ts)`,
    ]);
  });

  /**
   * The two shapes a text match cannot tell from an import, both of which this rule reported until it read the
   * reader's specifiers: `from '…'` inside a comment, and the same inside a template literal. `./state.ts` is
   * written in each case, so the regex had a resolvable target and the finding looked real.
   */
  it('ignores a machine import that is commented out', () => {
    pack({
      'features/notes/fe/contract.ts': "// import type { Ctx } from './state.ts';\nexport type Contract = { state: {} };",
      'features/notes/fe/state.ts': 'export type Ctx = { ready: boolean };',
      'features/notes/be/contract.ts': 'export type Contract = { outgoing: { type: "A" } };',
    });
    expect(findContractLeafImports([src], root)).toEqual([]);
  });

  it('ignores one written inside a template literal', () => {
    pack({
      'features/notes/fe/contract.ts': "export const SNIPPET = `import type { Ctx } from './state.ts'`;\nexport type Contract = { state: {} };",
      'features/notes/fe/state.ts': 'export type Ctx = { ready: boolean };',
      'features/notes/be/contract.ts': 'export type Contract = { outgoing: { type: "A" } };',
    });
    expect(findContractLeafImports([src], root)).toEqual([]);
  });

  it('checks nothing in a tree with no manifest, there being no contract to find', () => {
    writeAt(`${src}/features/notes/fe/contract.ts`, "import type { Ctx } from './state';");
    expect(findContractLeafImports([src], root)).toEqual([]);
  });
});

describe('findCrossFeatureImports', () => {
  const src = 'pack/src';
  /** The fixture pack's `package.json`: its subpath map, and the `exports` a case about publishing needs */
  const manifest = (exports?: Record<string, string>) =>
    writeAt('pack/package.json', JSON.stringify({ imports: PACK_IMPORTS, ...(exports ? { exports } : {}) }));

  /**
   * Every way a module can name another feature's frontend, as rows rather than as strings inside cases about
   * something else — which is how the barrel shape came to have no coverage at all: it was one specifier in a case
   * named after something else, and a rewrite of that specifier's spelling took the only case for the optional tail
   * in the rule's own pattern with it.
   *
   * `fe/public.ts` is a row for the opposite reason: it used to be excepted, a module per feature for exactly this
   * crossing, in packs and then for a while longer in the host. Nothing is excepted by name now.
   */
  const SHAPES: [shape: string, specifier: string, code?: string][] = [
    ['a # subpath', '#features/actions/fe/state.ts'],
    ['a relative path', '../../actions/fe/state.ts'],
    ['a barrel, with no path after fe', '../../actions/fe'],
    ['a .vue component', '../../actions/fe/canvas/list.vue'],
    ['the old fe/public module', '#features/actions/fe/public.ts'],
    ['a path a call names', '#features/actions/fe/state.ts', "vi.mock('#features/actions/fe/state.ts', () => ({}));"],
  ];

  // One importer for every row, inside its own feature's frontend, so no door applies and the finding is
  // unconditional. A relative row needs `../../`: one `..` from `features/code/fe/` lands inside `code/` itself.
  it.each(SHAPES)("flags another feature's frontend named by %s", (_shape, specifier, code) => {
    manifest();
    writeAt(`${src}/features/code/fe/panel.ts`, code ?? `import x from '${specifier}';`);
    expect(findCrossFeatureImports([src], root)).toEqual([`${src}/features/code/fe/panel.ts:1: ${specifier}`]);
  });

  // The line a pack author is shown is the file's, not the script block's
  it('reports the line inside a .vue script block', () => {
    manifest();
    writeAt(`${src}/features/code/fe/panel.vue`, "<script setup lang=\"ts\">\nimport { id } from '#features/actions/fe/state.ts'\n</script>");
    expect(findCrossFeatureImports([src], root)).toEqual([`${src}/features/code/fe/panel.vue:2: #features/actions/fe/state.ts`]);
  });

  /**
   * A claim about where the importer is rather than how it spells the import: sitting outside every feature is no
   * licence. What may name a feature's frontend is the module that assembles the package, which the cases below
   * read from its `exports`, and `extensions/` is not that.
   */
  it('flags a module that sits outside every feature', () => {
    writeAt(`${src}/extensions/viewer.ts`, "import List from '../features/notes/fe/canvas/list.vue';");
    expect(findCrossFeatureImports([src], root)).toEqual([`${src}/extensions/viewer.ts:1: ../features/notes/fe/canvas/list.vue`]);
  });

  it("allows a feature's own frontend, another's backend and shared modules, and generated code", () => {
    manifest();
    writeAt(`${src}/features/code/fe/panel.ts`, [
      "import { codeChild } from '#features/code/fe/utils/parent-communication.ts';",
      "import { usePluginState } from '#generated/fe.ts';",
      "import { pluginSettings } from '#features/settings/plugin-settings.ts';",
      "import type { ActionEntity } from '#features/actions/be/types.ts';",
    ].join('\n'));
    writeAt(`${src}/features/code/fe/features/list.ts`, "import state from '../state';");
    writeAt(`${src}/__generated__/pack-entry-fe.ts`, "import plugin from '../features/notes/fe/plugin.js';");
    // A feature's own modules outside fe/ may use its frontend, exporting what they make of it
    writeAt(`${src}/features/code/settings.ts`, "import { id } from './fe/state';\nconst label = `${id}!`;\nexport { label };");
    expect(findCrossFeatureImports([src], root)).toEqual([]);
  });

  /**
   * What a feature's own modules outside `fe/` may not do: pass its frontend on, in one step (`export … from`) or
   * in two (import, then export it again). The case above is the same modules using it and exporting what they
   * make of it, which is allowed — the door is the distinction, not the direction.
   */
  it('flags a feature that passes its own frontend on', () => {
    writeAt(`${src}/features/notes/index.ts`, "export { id, notesMachine } from './fe/state';\nexport * from './fe/public';");
    writeAt(`${src}/features/threads/door.ts`, "import { threadsMachine as machine } from './fe/state';\nimport * as ui from './fe/canvas';\nexport { machine };\nexport default ui;");
    expect(findCrossFeatureImports([src], root)).toEqual([
      `${src}/features/notes/index.ts:1: ./fe/state`,
      `${src}/features/notes/index.ts:2: ./fe/public`,
      `${src}/features/threads/door.ts:1: ./fe/state`,
      `${src}/features/threads/door.ts:2: ./fe/canvas`,
    ]);
  });
  /**
   * The one module that may name its features' frontends is what the package publishes — `@abuddy/host`'s `./fe`
   * barrel, the hand-written counterpart of a pack's generated `pack-entry-fe.ts`. It is read from the package's
   * `exports`, so nothing has to be listed here, and a module that merely sits outside every feature gets no
   * licence from that: the case above about one is flagged exactly as a feature would be.
   */
  it("excepts the entry a package publishes, and nothing else outside a feature", () => {
    manifest({ './fe': './src/fe/index.ts' });
    writeAt(`${src}/fe/index.ts`, "export { notesMachine } from '../features/notes/fe/state';");
    writeAt(`${src}/fe/helpers.ts`, "export { notesMachine } from '../features/notes/fe/state';");
    expect(findCrossFeatureImports([src], root)).toEqual([`${src}/fe/helpers.ts:1: ../features/notes/fe/state`]);
  });

  /**
   * Published *and* outside every feature. A package may publish one feature's own module — `@abuddy/host`
   * publishes `./settings` from `features/settings/be/index.ts` — and a feature's barrel is not the package's
   * assembly. Excepting it by visibility alone handed that one feature a licence to read another's frontend that
   * no other feature had, silently, which is the hole this whole rule exists to close.
   */
  it('gives a published module inside a feature no licence, since it assembles nothing', () => {
    manifest({ './notes': './src/features/notes/be/index.ts' });
    writeAt(`${src}/features/notes/be/index.ts`, "export { codeMachine } from '../../code/fe/state';");
    expect(findCrossFeatureImports([src], root)).toEqual([`${src}/features/notes/be/index.ts:1: ../../code/fe/state`]);
  });

  /**
   * What a syntax tree leaves out and a regex does not. Written before the rule read one, so each of these
   * failed first: the reader is why `abuddy-cli/CLAUDE.md` records that "a regex literal holding an unbalanced
   * quote made a commented-out import look real and failed a build naming a comment".
   *
   * Not hypothetical. Three commented-out imports already sit in `default-setup`'s SFCs, in
   * `features/library/fe/canvas.vue` and `features/threads/fe/chat/input.vue`; they are quiet only because they
   * point inside their own feature. One pointing at another feature's `fe/` would have failed the build.
   */
  it('reads code, not comments, templates, template literals or styles', () => {
    manifest();
    writeAt(`${src}/features/code/fe/panel.ts`, "// import { id } from '#features/actions/fe/state.ts';");
    writeAt(`${src}/features/code/fe/block.ts`, "/* import { id } from '#features/actions/fe/state.ts'; */");
    writeAt(`${src}/features/code/fe/help.ts`, "export const help = `import { id } from '#features/actions/fe/state.ts'`;");
    writeAt(`${src}/features/code/fe/canvas.vue`, [
      '<template><code>import { id } from \'#features/actions/fe/state.ts\'</code></template>',
      '<style scoped>@import \'../../actions/fe/theme.css\';</style>',
    ].join('\n'));
    expect(findCrossFeatureImports([src], root)).toEqual([]);
  });

  // Fails closed: with no `exports` to read, every module gets the strict rule — the opposite of an exception
  // derived from a file being missing, which would widen the gate exactly when something had gone.
  it('excepts nothing when the package publishes nothing', () => {
    writeAt(`${src}/fe/index.ts`, "export { notesMachine } from '../features/notes/fe/state';");
    expect(findCrossFeatureImports([src], root)).toEqual([`${src}/fe/index.ts:1: ../features/notes/fe/state`]);
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
      "import { repository } from '#generated/repository.ts';",
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
