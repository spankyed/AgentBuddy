// A contract used to be a value carrying phantom properties — `_incoming`/`_outgoing` on the object `defineSystem`
// returned — which codegen read with `propertyType(spec, '_outgoing')`. That is why an entry declared
// `const entry: SystemEntry = …` silently published no events: the annotation widened the value and took the
// phantoms with it. Contracts are declared types now, read with `declaredTypeOf`, and there is no value to widen.
//
// Nothing in the type system stops the pattern coming back, so these pin both halves of it: no `_`-prefixed member
// on the spec, and no property read of one in the reader.
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../../src');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf-8');

describe('a contract is a type, not a value with phantoms', () => {
  it('SystemSpec declares no `_`-prefixed member', () => {
    const source = read('framework/define-system.ts');
    const body = /export interface SystemSpec<[^>]*> \{([\s\S]*?)\n\}/.exec(source);
    expect(body, 'SystemSpec should still be an interface in define-system.ts').not.toBeNull();
    expect([...body![1].matchAll(/^\s*(_\w+)\s*[?:]/gm)].map((m) => m[1])).toEqual([]);
  });

  it('SystemEntry carries the spec whole, rather than picking members off it', () => {
    // `spec: Pick<SystemSpec<…>, '_incoming' | '_outgoing'>` was how the entry kept the phantoms in reach
    expect(read('framework/system-utils.ts')).not.toMatch(/spec:\s*Pick</);
  });

  it('the reader reads no `_`-prefixed property', () => {
    const source = read('build/module-exports.ts');
    expect([...source.matchAll(/propertyType\([^,]+,\s*'(_\w+)'/g)].map((m) => m[1])).toEqual([]);
  });
});
