import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { compile } from '../../../src/build/compilers/flow-compiler';
import type { FlowEARS } from '../../../src/build/compilers/flow-compiler';
import { exportFlowsToDSL } from '../../../src/build/compilers/flow-to-dsl';
import { clearMemory } from '../../../src/ears/attribute-storage';
import { tx } from '../../../src/ears/runtime';
import type { EARS } from '../../../src/types/entities';
import type { FlowDSL } from '../../../src/build/compilers/flow-types';
import { loadCompiledRows } from './load-compiled';
import { setupInMemoryEARS } from './in-memory-ears';

export function createRoundTrip(ears: FlowEARS, rootFlowRole: string) {
  let tmpDir: string;

  return {
    beforeEach() {
      setupInMemoryEARS();
      clearMemory();
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsl-rt-'));
    },
    afterEach() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
    roundTrip(
      dsl: FlowDSL,
      opts?: { actions?: Map<string, string>; prompts?: Map<string, string> },
    ): FlowDSL {
      const compiled = compile(dsl, ears, opts);
      loadCompiledRows(compiled);

      if (opts?.actions) {
        for (const [label, id] of opts.actions) {
          tx(id as EARS.EntityId, true).batchPut({ entityType: ears.Entity.Action, label });
        }
      }
      if (opts?.prompts) {
        for (const [label, id] of opts.prompts) {
          tx(id as EARS.EntityId, true).batchPut({ entityType: ears.Entity.Prompt, label });
        }
      }

      const { filePath } = exportFlowsToDSL(tmpDir, { ears, rootFlowRole }, false);
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    },
  };
}
