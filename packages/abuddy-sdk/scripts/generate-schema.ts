import * as fs from 'node:fs';
import * as path from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ManifestSchema } from '../src/build/manifest-schema';

const jsonSchema = zodToJsonSchema(ManifestSchema, {
  $refStrategy: 'none',
});

Object.assign(jsonSchema, {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://agentbuddy.dev/schemas/abuddy.json',
  $comment: 'Auto-generated from manifest-schema.ts — do not edit by hand. Run: npm run generate:schema',
  title: 'AgentBuddy Pack Manifest',
  description: 'Configuration manifest for an AgentBuddy pack. Declares metadata, features, entities, services, extensions, seeds, and build-time codegen inputs.',
});

const outPath = path.resolve(import.meta.dirname, '..', 'abuddy.schema.json');
const generated = JSON.stringify(jsonSchema, null, 2) + '\n';

if (process.argv.includes('--check')) {
  const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf-8') : '';
  if (existing !== generated) {
    console.error('abuddy.schema.json is out of date. Run: npm run generate:schema');
    process.exit(1);
  }
  console.log('abuddy.schema.json is up to date.');
} else {
  fs.writeFileSync(outPath, generated);
  console.log(`Wrote ${outPath}`);
}
