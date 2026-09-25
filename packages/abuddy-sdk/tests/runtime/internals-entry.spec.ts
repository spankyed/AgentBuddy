// Reading the bound runtimes and unbinding them is the host's: @abuddy/sdk/runtime, which packs import (and the app
// bridges to them), doesn't export them; @abuddy/sdk/runtime/internals, a source-only entry, does
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as runtime from '../../src/runtime/index.ts';
import * as internals from '../../src/runtime/internals.ts';

const HOST_ONLY = ['unbindHost', 'boundHost', 'unbindFeHost', 'boundFeHost'];

describe('@abuddy/sdk/runtime/internals', () => {
  it('holds what @abuddy/sdk/runtime leaves out', () => {
    expect(Object.keys(runtime).filter((name) => HOST_ONLY.includes(name))).toEqual([]);
    expect(Object.keys(internals)).toEqual(expect.arrayContaining([...HOST_ONLY]));
  });

});
