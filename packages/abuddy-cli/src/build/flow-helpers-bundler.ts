import * as path from 'node:path';
import type { PackFlowHelpers } from '@abuddy/sdk/build';
import { bundlePackFlowHelpersModule, type BundleRuntimeOptions } from './be-bundler';
import { bundleDeclarations } from './types-bundler';
import { facadeProblems } from './facade-gate';

/** The declarations of a pack's flow helpers in its types dir */
const FLOW_HELPERS_TYPES_FILE = 'flow-helpers.d.ts';

/**
 * Bundles a pack's generated flow helpers (src/__generated__/flow-helpers.ts) for its snapshot: the
 * ES module, the names it exports and its declarations (written to `typesDir`). Dependents re-export
 * them, so they get the helpers and option types this pack generated. The declarations must be usable
 * by dependents, as the facade types must.
 */
export async function bundlePackFlowHelpers(
  packDir: string,
  typesDir: string,
  options: BundleRuntimeOptions = {},
): Promise<{ success: true; flowHelpers: PackFlowHelpers } | { success: false; error: string }> {
  const bundled = await bundlePackFlowHelpersModule(packDir, options);
  if (!bundled.success) return bundled;

  const typesFile = path.join(typesDir, FLOW_HELPERS_TYPES_FILE);
  const types = await bundleDeclarations(packDir, path.join(packDir, 'src', '__generated__', 'flow-helpers.ts'), typesFile);
  if (!types.success) return types;
  const problems = facadeProblems(packDir, typesFile);
  if (problems.length > 0) {
    return { success: false, error: `the flow helpers' types aren't usable by packs that depend on this one:\n${problems.map((p) => `  - ${p}`).join('\n')}` };
  }

  return { success: true, flowHelpers: { exports: bundled.exports, module: bundled.module, types: types.content } };
}
