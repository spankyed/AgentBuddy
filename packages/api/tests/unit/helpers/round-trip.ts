import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { compile } from '@/systems/flows/dsl/compiler';
import { exportFlowsDSL } from '@/systems/flows/dsl/export-dsl';
import { clearMemory } from '@/core/ears/attribute-storage';
import { tx } from '@/core/ears/helpers/transaction';
import { EARS } from '@/core/types';
import type { FlowDSL } from '@/systems/flows/dsl/types';
import { loadCompiledRows } from './load-compiled';

/**
 * Factory that returns roundTrip + lifecycle hooks.
 * Usage:
 *   const rt = createRoundTrip();
 *   beforeEach(() => rt.beforeEach());
 *   afterEach(() => rt.afterEach());
 *   // ... rt.roundTrip(dsl)
 */
export function createRoundTrip() {
  let tmpDir: string;

  return {
    beforeEach() {
      clearMemory();
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsl-rt-'));
    },
    afterEach() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
    /**
     * Compile DSL -> load into EARS -> export -> return exported DSL.
     * Optionally seeds Action/Prompt entities for reverse-map resolution.
     */
    roundTrip(
      dsl: FlowDSL,
      opts?: { actions?: Map<string, string>; prompts?: Map<string, string> },
    ): FlowDSL {
      const compiled = compile(dsl, opts);
      loadCompiledRows(compiled);

      // Seed reverse-lookup entities (Action/Prompt) so the exporter can resolve labels
      if (opts?.actions) {
        for (const [label, id] of opts.actions) {
          tx(id as EARS.EntityId, true).batchPut({ entityType: EARS.Entity.Action, label });
        }
      }
      if (opts?.prompts) {
        for (const [label, id] of opts.prompts) {
          tx(id as EARS.EntityId, true).batchPut({ entityType: EARS.Entity.Prompt, label });
        }
      }

      const { filePath } = exportFlowsDSL(tmpDir);
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    },
  };
}
