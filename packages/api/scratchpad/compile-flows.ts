import * as fs from 'fs';
import * as path from 'path';
import type { FlowDSL } from './types';
import { isFlowConfig } from './types';

const FLOWS_DIR = path.join(import.meta.dirname, 'flows');
const OUTPUT_FILE = path.join(FLOWS_DIR, 'compiled-flows.json');

export async function compileFlows(): Promise<void> {
  console.log(`Compiling flows from: ${FLOWS_DIR}`);

  if (!fs.existsSync(FLOWS_DIR)) {
    console.error('Flows directory not found:', FLOWS_DIR);
    process.exit(1);
  }

  const tsFiles = fs.readdirSync(FLOWS_DIR)
    .filter(f => f.endsWith('.ts'))
    .sort();

  console.log(`Found ${tsFiles.length} TypeScript file(s): ${tsFiles.join(', ')}`);

  const merged: FlowDSL = {};
  let loaded = 0;
  let rootFlowName: string | null = null;

  for (const file of tsFiles) {
    const filePath = path.join(FLOWS_DIR, file);
    try {
      const mod = await import(filePath);

      if (!mod.default) {
        console.log(`  - ${file} (no default export, skipping)`);
        continue;
      }

      const flowDSL = mod.default as FlowDSL;
      for (const flowName of Object.keys(flowDSL)) {
        if (merged[flowName]) {
          console.error(`  x Duplicate flow name "${flowName}" in ${file}`);
          process.exit(1);
        }

        const entry = flowDSL[flowName];
        if (isFlowConfig(entry) && entry.root) {
          if (rootFlowName) {
            console.error(`  x Multiple root flows: "${rootFlowName}" and "${flowName}" (in ${file})`);
            process.exit(1);
          }
          rootFlowName = flowName;
        }

        merged[flowName] = entry;
      }

      console.log(`  + ${file} (${Object.keys(flowDSL).length} flow(s))`);
      loaded++;
    } catch (err) {
      console.error(`  x ${file} — failed to import:`, err);
      process.exit(1);
    }
  }

  if (rootFlowName) {
    console.log(`  * Root flow: "${rootFlowName}"`);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(merged, null, 2) + '\n');
  console.log(`\nWrote ${Object.keys(merged).length} flow(s) from ${loaded} file(s) to ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}
