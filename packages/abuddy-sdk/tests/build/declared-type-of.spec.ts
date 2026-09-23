// `declaredTypeOf` is what lets a plugin's contract be a type rather than a value carrying phantom properties.
// The reader it sits beside, `exportedValueType`, resolves values only, and reading that way is what forced the
// contract into `fe/plugin.ts` — whose machine imports cycle back through the generated events module.
//
// These cover the three answers it has to give, through the public reader that uses it.
import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createModuleExports } from '../../src/build/module-exports.ts';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

/** A pack root holding one module, and the reader over it */
function reader(source: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-declared-type-'));
  dirs.push(root);
  const file = path.join(root, 'types.ts');
  fs.writeFileSync(file, source);
  return { read: createModuleExports(root, [file]), file };
}

describe('declaredTypeOf, through inboxEventTypesOf', () => {
  it('reads a contract declared as a type alias', () => {
    const { read, file } = reader("export type Contract = { state: { ready: boolean }; inbox: { public: { type: 'NOTE.OPEN'; noteId: string } } };\n");
    expect(read.inboxEventTypesOf(file, 'Contract')).toEqual(['NOTE.OPEN']);
  });

  it('reads a contract declared as an interface', () => {
    const { read, file } = reader("export interface Contract { state: { ready: boolean }; inbox: { public: { type: 'NOTE.OPEN'; noteId: string } } }\n");
    expect(read.inboxEventTypesOf(file, 'Contract')).toEqual(['NOTE.OPEN']);
  });

  it('follows a re-export to the module that declares it', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-declared-type-'));
    dirs.push(root);
    fs.writeFileSync(path.join(root, 'inner.ts'), "export type Contract = { state: {}; inbox: { pack: { type: 'A' } } };\n");
    fs.writeFileSync(path.join(root, 'types.ts'), "export type { Contract } from './inner.ts';\n");
    const read = createModuleExports(root, [path.join(root, 'types.ts'), path.join(root, 'inner.ts')]);
    expect(read.inboxEventTypesOf(path.join(root, 'types.ts'), 'Contract')).toEqual(['A']);
  });

  it('names the type it looked for when the module declares none', () => {
    const { read, file } = reader('export type Other = { state: {} };\n');
    expect(() => read.inboxEventTypesOf(file, 'Contract')).toThrow(/declares no type "Contract"/);
  });

  // The counterpart of the old reader's failure: a value has no declared type to read
  it('names the type it looked for when the export is only a value', () => {
    const { read, file } = reader('export const Contract = { state: {} };\n');
    expect(() => read.inboxEventTypesOf(file, 'Contract')).toThrow(/declares no type "Contract"/);
  });

  it('reads a contract that publishes state and opens no inbox as taking nothing', () => {
    const { read, file } = reader('export type Contract = { state: { ready: boolean } };\n');
    expect(read.inboxEventTypesOf(file, 'Contract')).toEqual([]);
  });

  it('collects every audience the inbox opens', () => {
    const { read, file } = reader("export type Contract = { state: {}; inbox: { pack: { type: 'A' }; public: { type: 'B' } | { type: 'C' } } };\n");
    expect(read.inboxEventTypesOf(file, 'Contract').sort()).toEqual(['A', 'B', 'C']);
  });

  it('refuses an audience that does not exist, rather than silently declaring nothing', () => {
    const { read, file } = reader("export type Contract = { state: {}; inbox: { publik: { type: 'A' } } };\n");
    expect(() => read.inboxEventTypesOf(file, 'Contract')).toThrow(/"publik".*is not an audience/s);
  });
});
