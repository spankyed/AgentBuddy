import * as path from 'node:path';
import { renderTemplate } from '../../templates.ts';
import { regenerateAfterScaffold } from '../generate-entries';
import { validateName, writeIfNotExists, logCreated, parseFlag, hasFlag } from './write';
import { readManifest, writeManifest, addArtifact as addArtifactToManifest } from './manifest';

const HELP = `
Usage: apack add artifact <type> [options]

Options:
  --icon <Icon>    Lucide icon name (default: FileText)

Example:
  apack add artifact chart --icon BarChart3
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

  // The manifest entry is the whole declaration, and codegen is what carries it into the pack's entries —
  // there is no barrel to edit any more, so without this the artifact reaches nothing until something else
  // regenerates
  const regenerated = await regenerateAfterScaffold(root);

  console.log(`\nCreated artifact viewer "${type}":`);
  logCreated(root, created);
  console.log(`  ~ apack.json (artifacts.${type})`);
  if (regenerated) console.log(`\n  __generated__/ regenerated`);
}
