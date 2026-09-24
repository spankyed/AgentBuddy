// Compiles flow DSL into a private in-memory engine and exports it back, as tooling does: the installed
// engine (if any) is never touched
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createEarsEngine, type EarsEngine } from '@abuddy/ears';
import { compile } from '../../../src/build/compilers/flow-compiler.ts';
import { exportFlowsToDSL } from '../../../src/build/compilers/flow-to-dsl.ts';
import { EARS } from '../../../src/types/entities.ts';
import type { FlowDSL } from '../../../src/build/compilers/flow-types.ts';
import type { StepDefinition } from '../../../src/steps/types.ts';
import { loadCompiledRows } from './load-compiled.ts';

const entityTypes = new Set<string>(Object.values(EARS.Entity));

/** Round trips with `steps`, or, without them, the registered packs' */
export function createRoundTrip(rootFlowRole: string, steps?: StepDefinition[]) {
  let tmpDir: string;
  let engine: EarsEngine;

  return {
    beforeEach() {
      engine = createEarsEngine({ isEntityType: (value) => entityTypes.has(value) });
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsl-rt-'));
    },
    afterEach() {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
    /** The engine the last round trip compiled into */
    engine: () => engine,
    roundTrip(
      dsl: FlowDSL,
      opts?: { actions?: Map<string, string>; prompts?: Map<string, string> },
    ): FlowDSL {
      const { tx } = engine.query;
      const compiled = compile(dsl, { ...opts, steps });
      loadCompiledRows(engine.query, compiled);

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

      const { filePath } = exportFlowsToDSL(tmpDir, { rootFlowRole, engine: engine.query, steps }, false);
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    },
  };
}
