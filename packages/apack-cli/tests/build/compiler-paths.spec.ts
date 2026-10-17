import path from 'node:path';
import { expect, it } from 'vitest';
import { compilerSourcePath, parseCompilerPaths } from '@apackdev/host/build/compiler-inputs';

it('maps captured inputs to their source origins without rewriting neighboring paths', () => {
  const captured = path.resolve('/temporary/compiler');
  const source = path.resolve('/original');
  const mappings = parseCompilerPaths([{ captured, source }]);
  expect(compilerSourcePath(path.join(captured, 'lib/index.ts'), mappings)).toBe(path.join(source, 'lib/index.ts'));
  expect(compilerSourcePath(captured, mappings)).toBe(source);
  const neighbor = `${captured}-other/index.ts`;
  expect(compilerSourcePath(neighbor, mappings)).toBe(neighbor);
});

it.each(['null', '{}', '[null]', '[{"captured":"relative","source":"/absolute"}]', '[{"captured":"/absolute","source":"relative"}]'])('refuses invalid private compiler path data: %s', value => {
  expect(() => parseCompilerPaths(JSON.parse(value))).toThrow('Invalid captured compiler path mappings');
});
