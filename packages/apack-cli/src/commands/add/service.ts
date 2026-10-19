import { writeManifest } from '../../manifest-writer.ts';
import * as path from 'node:path';
import { regenerateAfterScaffold } from '../generate-entries';
import { renderTemplate } from '../../templates.ts';
import { validateName, toCamelCase, writeIfNotExists, logCreated, parseFlag, hasFlag } from './write';
import { readManifest, addPackService, addFeatureService } from './manifest';

// apack.json names this object ("path#exportName"): `services.<camel>` is the object itself

function serviceExport(camel: string): string {
  return `${camel}Service`;
}

const HELP = `
Usage: apack pack add service <name> [options]

Options:
  --feature <feature>    Create a feature service instead of pack-level

Example:
  apack pack add service cache
  apack pack add service bookmarks --feature bookmarks
`.trim();

export async function addService(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const name = args[0];
  validateName(name, 'Service');

  const feature = parseFlag(args, '--feature');
  const camel = toCamelCase(name);

  const manifest = readManifest(root);
  const relative = feature ? `src/features/${feature}/be/services/${name}.ts` : `src/extensions/services/${name}.ts`;
  const target = `${relative}#${serviceExport(camel)}`;
  if (feature) addFeatureService(manifest, feature, camel, target);
  else addPackService(manifest, camel, target);

  const created: string[] = [];
  const filePath = path.join(root, relative);
  if (writeIfNotExists(filePath, renderTemplate('pack/src/extensions/services/service.ts', { SERVICE_EXPORT: serviceExport(camel), CAMEL: camel }))) created.push(filePath);
  writeManifest(root, manifest);

  const regenerated = await regenerateAfterScaffold(root);

  console.log(`\nCreated service "${camel}"${feature ? ` for feature "${feature}"` : ''} (services.${camel}):`);
  logCreated(root, created);
  if (regenerated) console.log(`\n  manifest updated + __generated__/ regenerated`);
}
