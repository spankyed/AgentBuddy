import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readTsconfigAliases } from '../../src/build/be-bundler';

let packDir: string;

beforeEach(() => { packDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tsconfig-aliases-')); });
afterEach(() => { fs.rmSync(packDir, { recursive: true, force: true }); });

const writeTsconfig = (contents: string) => fs.writeFileSync(path.join(packDir, 'tsconfig.json'), contents);

describe('readTsconfigAliases', () => {
  it('maps wildcard paths to absolute directories', () => {
    writeTsconfig(JSON.stringify({ compilerOptions: { paths: { '#generated/*': ['./src/__generated__/*'] } } }));
    expect(readTsconfigAliases(packDir)).toEqual({ '#generated': path.join(packDir, 'src/__generated__') });
  });

  // The tsconfig `abuddy init` scaffolds carries a $schema URL, and its `//` used to eat the rest of
  // the line, so the file failed to parse and every alias below it was dropped without a word
  it('reads a tsconfig whose values contain "//", and one with comments and trailing commas', () => {
    writeTsconfig(`{
      "$schema": "https://json.schemastore.org/tsconfig",
      // the pack's generated facades
      "compilerOptions": {
        "paths": { "#generated/*": ["./src/__generated__/*"] },
      },
    }`);
    expect(readTsconfigAliases(packDir)).toEqual({ '#generated': path.join(packDir, 'src/__generated__') });
  });

  it('is empty when there is no tsconfig, and when one cannot be parsed', () => {
    expect(readTsconfigAliases(packDir)).toEqual({});
    writeTsconfig('{ not json');
    expect(readTsconfigAliases(packDir)).toEqual({});
  });
});
