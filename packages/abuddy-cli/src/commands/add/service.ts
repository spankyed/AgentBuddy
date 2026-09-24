import * as path from 'node:path';
import { regenerateAfterScaffold } from '../generate-entries';
import { validateName, toCamelCase, writeIfNotExists, logCreated, parseFlag, hasFlag } from './templates';
import { readManifest, writeManifest, addPackService, addFeatureService } from './manifest';

// abuddy.json names this object ("path#exportName"): `services.<camel>` is the object itself
const SERVICE_TEMPLATE = (camel: string) => `export const ${serviceExport(camel)} = {
  // Methods systems and actions call as services.${camel}.<method>()
};
`;

function serviceExport(camel: string): string {
  return `${camel}Service`;
}

const HELP = `
Usage: abuddy add service <name> [options]

Options:
  --feature <feature>    Create a feature service instead of pack-level

Example:
  abuddy add service cache
  abuddy add service bookmarks --feature bookmarks
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

  const created: string[] = [];

  if (feature) {
    const filePath = path.join(root, 'src', 'features', feature, 'be', 'services', `${name}.ts`);
    if (writeIfNotExists(filePath, SERVICE_TEMPLATE(camel))) created.push(filePath);

    const manifest = readManifest(root);
    addFeatureService(manifest, feature, camel, `src/features/${feature}/be/services/${name}.ts#${serviceExport(camel)}`);
    writeManifest(root, manifest);
  } else {
    const filePath = path.join(root, 'src', 'extensions', 'services', `${name}.ts`);
    if (writeIfNotExists(filePath, SERVICE_TEMPLATE(camel))) created.push(filePath);

    const manifest = readManifest(root);
    addPackService(manifest, camel, `src/extensions/services/${name}.ts#${serviceExport(camel)}`);
    writeManifest(root, manifest);
  }

  const regenerated = await regenerateAfterScaffold(root);

  console.log(`\nCreated service "${camel}"${feature ? ` for feature "${feature}"` : ''} (services.${camel}):`);
  logCreated(root, created);
  if (regenerated) console.log(`\n  manifest updated + __generated__/ regenerated`);
}
