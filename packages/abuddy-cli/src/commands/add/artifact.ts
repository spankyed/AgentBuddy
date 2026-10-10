import * as path from 'node:path';
import { renderTemplate } from '../../templates.ts';
import { validateName, writeIfNotExists, logCreated, parseFlag, hasFlag } from './write';
import { readManifest, writeManifest, addArtifact as addArtifactToManifest } from './manifest';

const HELP = `
Usage: abuddy add artifact <type> [options]

Options:
  --icon <Icon>    Lucide icon name (default: FileText)

Example:
  abuddy add artifact chart --icon BarChart3
`.trim();

// The threads artifact panel renders a viewer with the selected `artifact` (ArtifactItem)

export async function addArtifact(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const type = args[0];
  validateName(type, 'Artifact');

  const icon = parseFlag(args, '--icon') || 'FileText';
  const viewerPath = `src/extensions/artifacts/viewers/${type}-artifact.vue`;

  // The manifest entry first: it is the declaration, and a viewer no manifest names is dead weight
  const manifest = readManifest(root);
  addArtifactToManifest(manifest, type, { icon, component: viewerPath });
  writeManifest(root, manifest);

  const created: string[] = [];
  const filePath = path.join(root, viewerPath);
  if (writeIfNotExists(filePath, renderTemplate('pack/src/extensions/artifacts/viewers/artifact.vue', { ICON: icon }))) {
    created.push(filePath);
  }

  console.log(`\nCreated artifact viewer "${type}":`);
  logCreated(root, created);
  console.log(`  ~ abuddy.json (artifacts.${type})`);
}
