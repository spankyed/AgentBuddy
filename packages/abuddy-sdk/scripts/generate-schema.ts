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
fs.writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + '\n');
console.log(`Wrote ${outPath}`);
