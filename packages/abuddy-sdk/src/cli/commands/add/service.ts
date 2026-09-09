import * as path from 'node:path';
import { generateEntries } from '../generate-entries';
import { validateName, toCamelCase, writeIfNotExists, logCreated, parseFlag } from './templates';
import { readManifest, writeManifest, addPackService, addFeatureService } from './manifest';

const SERVICE_TEMPLATE = (camel: string) => `export function create${camel[0].toUpperCase() + camel.slice(1)}Service() {
  return {};
}
`;

export async function addService(args: string[], root: string) {
  const name = args[0];
  validateName(name, 'Service');

  const feature = parseFlag(args, '--feature');
  const camel = toCamelCase(name);

  const created: string[] = [];

  if (feature) {
    const filePath = path.join(root, 'src', 'features', feature, 'be', 'services', `${name}.ts`);
    if (writeIfNotExists(filePath, SERVICE_TEMPLATE(camel))) created.push(filePath);

    const manifest = readManifest(root);
    addFeatureService(manifest, feature, name, `src/features/${feature}/be/services/${name}.ts`);
    writeManifest(root, manifest);
  } else {
    const filePath = path.join(root, 'src', 'extensions', 'services', `${name}.ts`);
    if (writeIfNotExists(filePath, SERVICE_TEMPLATE(camel))) created.push(filePath);

    const manifest = readManifest(root);
    addPackService(manifest, name, `src/extensions/services/${name}.ts`);
    writeManifest(root, manifest);
  }

  await generateEntries([], root);

  console.log(`\nCreated service "${name}"${feature ? ` for feature "${feature}"` : ''}:`);
  logCreated(root, created);
  console.log(`\n  manifest updated + __generated__/ regenerated`);
}
