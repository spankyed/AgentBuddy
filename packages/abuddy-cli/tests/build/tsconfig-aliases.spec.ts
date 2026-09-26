import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readTsconfigAliases } from '../../src/build/tsconfig-aliases';

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

  // A pack that keeps its compiler settings in a shared base has its aliases there, and reading one file
  // answers for one file: the bundler saw no aliases at all and resolved nothing
  it('takes the paths a tsconfig inherits from the base it extends', () => {
    fs.writeFileSync(path.join(packDir, 'base.json'), JSON.stringify({
      compilerOptions: { paths: { '#generated/*': ['./src/__generated__/*'] } },
    }));
    writeTsconfig(JSON.stringify({ extends: './base.json', compilerOptions: { strict: true } }));

    expect(readTsconfigAliases(packDir)).toEqual({ '#generated': path.join(packDir, 'src/__generated__') });
  });

  it("lets the pack's own paths win over the base's", () => {
    fs.writeFileSync(path.join(packDir, 'base.json'), JSON.stringify({
      compilerOptions: { paths: { '#generated/*': ['./base-generated/*'] } },
    }));
    writeTsconfig(JSON.stringify({
      extends: './base.json',
      compilerOptions: { paths: { '#generated/*': ['./src/__generated__/*'] } },
    }));

    expect(readTsconfigAliases(packDir)).toEqual({ '#generated': path.join(packDir, 'src/__generated__') });
  });

  // Ignoring `baseUrl` does not lose an alias, it produces a wrong one — every import through it resolving
  // against the pack root instead of wherever the pack said. Nothing covered it until the two copies merged.
  it('resolves a relative target against baseUrl when the config sets one', () => {
    writeTsconfig(JSON.stringify({
      compilerOptions: { baseUrl: './src', paths: { '#generated/*': ['./__generated__/*'] } },
    }));
    expect(readTsconfigAliases(packDir)).toEqual({ '#generated': path.join(packDir, 'src/__generated__') });
  });

  it('reads a tsconfig with a block comment, which only the compiler strips', () => {
    writeTsconfig(`{
      /* the pack's compiler settings */
      "compilerOptions": { "paths": { "#generated/*": ["./src/__generated__/*"] } }
    }`);
    expect(readTsconfigAliases(packDir)).toEqual({ '#generated': path.join(packDir, 'src/__generated__') });
  });

  it('is empty when there is no tsconfig, and when one cannot be parsed', () => {
    expect(readTsconfigAliases(packDir)).toEqual({});
    writeTsconfig('{ not json');
    expect(readTsconfigAliases(packDir)).toEqual({});
  });
});
