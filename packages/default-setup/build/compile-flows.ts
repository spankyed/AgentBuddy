import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { pathToFileURL } from 'url';
import type { FlowDSL } from '../src/types';
import { isFlowConfig } from './flow-dsl-utils';
import { validate } from './flow-dsl-validator';

const ROOT = path.resolve(import.meta.dirname, '..');
const FLOWS_DIR = path.join(ROOT, 'src', 'flows');
const OUTPUT_FILE = path.join(ROOT, 'dist', 'compiled-flows.json');

export async function compileFlows(): Promise<void> {
  console.log(`Compiling flows from: ${FLOWS_DIR}`);

  if (!fs.existsSync(FLOWS_DIR)) {
    console.log(`Flows directory not found: ${FLOWS_DIR}`);
    console.log(`\nWrote 0 flow(s) to dist/compiled-flows.json\n`);
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify([], null, 2));
    return;
  }

  const tsFiles = fs.readdirSync(FLOWS_DIR)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.example.ts'))
    .sort();

  console.log(`Found ${tsFiles.length} TypeScript file(s): ${tsFiles.join(', ')}`);

  const merged: FlowDSL = {};
  let loaded = 0;
  let rootFlowName: string | null = null;

  for (const file of tsFiles) {
    const filePath = path.join(FLOWS_DIR, file);
    try {
      const mod = await import(pathToFileURL(filePath).href);

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

  // --- Validate against compiled actions & prompts ---
  const compiledDir = path.dirname(OUTPUT_FILE);
  const actionLabels = loadLabels(path.join(compiledDir, 'compiled-actions.json'));
  const promptLabels = loadLabels(path.join(compiledDir, 'compiled-prompts.json'));

  const validation = validate(merged, {
    actions: actionLabels,
    prompts: promptLabels,
  });

  if (!validation.valid) {
    console.error('\n  Validation errors:');
    for (const err of validation.errors) {
      console.error(`    ${err.path}: ${err.message}`);
    }
    process.exit(1);
  }

  // Normalize all entries to FlowConfig and embed per-flow source hashes.
  const hashed: Record<string, object> = {};
  for (const [name, entry] of Object.entries(merged)) {
    const config = isFlowConfig(entry) ? entry : { tracks: entry };
    const sourceHash = crypto.createHash('sha256')
      .update(JSON.stringify({ tracks: config.tracks, root: (config as any).root }))
      .digest('hex')
      .slice(0, 16);
    hashed[name] = { ...config, sourceHash };
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(hashed, null, 2) + '\n');
  console.log(`\nWrote ${Object.keys(hashed).length} flow(s) from ${loaded} file(s) to ${path.relative(process.cwd(), OUTPUT_FILE)}`);
}

function loadLabels(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Array<{ label: string }>;
  return data.map(item => item.label);
}
