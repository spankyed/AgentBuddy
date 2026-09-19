// What packs registered lives in the registry instances the app, the harness and the CLI create: no module that
// registers or looks up packs' extensions keeps any of it at module scope.
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const HOST_SRC = path.resolve(import.meta.dirname, '../../src');
const SDK_SRC = path.resolve(import.meta.dirname, '../../../abuddy-sdk/src');

/** The SDK's lookups of what packs registered, and the host modules that hold it */
const REGISTRY_MODULES = [
  ...[
    'designations/index.ts',
    'steps/registry.ts',
    'artifacts/registry.ts',
    'blocks/registry.ts',
    'seed/hooks.ts',
    'utils/seed.ts',
    'framework/pack-settings.ts',
    'framework/pack-commands.ts',
    'fe/tiptap-plugins.ts',
    'fe/dsl-types.ts',
    'services/index.ts',
    'runtime/packs-view.ts',
  ].map((file) => path.join(SDK_SRC, file)),
  ...[
    'packs/pack-registration.ts',
    'packs/extensions.ts',
    'packs/backend-extensions.ts',
    'fe/pack-store.ts',
    'fe/app-extensions.ts',
  ].map((file) => path.join(HOST_SRC, file)),
];

const COLLECTIONS = new Set(['Map', 'Set', 'WeakMap', 'WeakSet', 'Array']);

/** An array literal, unless it's a readonly constant (`[...] as const`) */
function isMutableArray(node: ts.Expression): boolean {
  let expr = node;
  while (ts.isSatisfiesExpression(expr) || ts.isParenthesizedExpression(expr)) expr = expr.expression;
  if (ts.isAsExpression(expr)) {
    if (ts.isTypeReferenceNode(expr.type) && expr.type.typeName.getText() === 'const') return false;
    expr = expr.expression;
  }
  return ts.isArrayLiteralExpression(expr);
}

/** The module-scope state a source file declares: `let`/`var`, collections, class instances and mutable arrays */
function moduleState(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const classes = new Set(sf.statements.filter(ts.isClassDeclaration).map((c) => c.name?.text));
  const found: string[] = [];
  for (const statement of sf.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const { flags } = statement.declarationList;
    for (const decl of statement.declarationList.declarations) {
      const name = decl.name.getText(sf);
      const line = sf.getLineAndCharacterOfPosition(decl.getStart(sf)).line + 1;
      const where = `${path.basename(file)}:${line} ${name}`;
      if (!(flags & ts.NodeFlags.Const)) {
        found.push(`${where} (let/var)`);
        continue;
      }
      const init = decl.initializer;
      if (!init) continue;
      if (ts.isNewExpression(init) && ts.isIdentifier(init.expression)
        && (COLLECTIONS.has(init.expression.text) || classes.has(init.expression.text))) {
        found.push(`${where} (new ${init.expression.text})`);
      } else if (isMutableArray(init)) {
        found.push(`${where} (array)`);
      }
    }
  }
  return found;
}

describe('registry modules', () => {
  it('keep no state at module scope', () => {
    const found = REGISTRY_MODULES.flatMap((file) => moduleState(file, fs.readFileSync(file, 'utf-8')));
    expect(found, 'keep what packs registered in the registry instance (createPackRegistry, createFePackRegistry)').toEqual([]);
  });

  it.each([
    ['const registry = new Map<string, string>();'],
    ['const listeners = new Set<() => void>();'],
    ['let current = 0;'],
    ['const plugins: string[] = [];'],
    ['class Registry { steps = new Map(); }\nexport const stepRegistry = new Registry();'],
  ])('finds %s', (source) => {
    expect(moduleState('planted.ts', source)).toHaveLength(1);
  });

  it('allows constants and state inside functions', () => {
    expect(moduleState('fine.ts', [
      "const NAMES = ['a', 'b'] as const satisfies readonly string[];",
      'const lookup = { get: () => undefined };',
      'export const proxy = new Proxy({}, {});',
      'export function create() { const byId = new Map(); let n = 0; return { byId, n }; }',
    ].join('\n'))).toEqual([]);
  });
});
