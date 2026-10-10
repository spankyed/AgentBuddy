import * as path from 'node:path';
import { regenerateAfterScaffold } from '../generate-entries';
import { validateName, toPascalCase, writeIfNotExists, logCreated, hasFlag } from './write';
import { renderTemplate } from '../../templates.ts';
import { readManifest, writeManifest, addBlock as addBlockToManifest } from './manifest';

const HELP = `
Usage: abuddy add block <type> [options]

Options:
  --input    Create an input block instead of a display block

Example:
  abuddy add block rating
  abuddy add block color-picker --input
`.trim();

// The threads chat renders a message's blocks with each block's `props` spread as component props;
// input blocks also get `disabled` (the message has been answered) and `response`, and answer
// by emitting `submit` (the response) or `cancel`


export async function addBlock(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const type = args[0];
  validateName(type, 'Block');

  const isInput = hasFlag(args, '--input');
  const pascal = toPascalCase(type);

  // Each branch renders its template by name, which is how `scaffold-templates.spec.ts` sees that a
  // template under `templates/` has a caller at all
  const [componentPath, component] = isInput
    ? [`src/extensions/blocks/input/${pascal}Input.vue`, renderTemplate('pack/src/extensions/blocks/input/block.vue', { PASCAL: pascal })]
    : [`src/extensions/blocks/display/${pascal}Block.vue`, renderTemplate('pack/src/extensions/blocks/display/block.vue', { PASCAL: pascal })];

  // The manifest entry first: it is the declaration, and a block declared with no component is a
  // clearer failure than a component no manifest names
  const manifest = readManifest(root);
  addBlockToManifest(manifest, type, { ...(isInput ? { kind: 'input' as const } : {}), component: componentPath });
  writeManifest(root, manifest);

  const created: string[] = [];
  const filePath = path.join(root, componentPath);
  if (writeIfNotExists(filePath, component)) created.push(filePath);

  // As for an artifact: the manifest entry is the declaration and codegen is what carries it into the
  // pack's entries, so a scaffold that skipped this left the block reaching nothing
  const regenerated = await regenerateAfterScaffold(root);

  console.log(`\nCreated block "${type}":`);
  logCreated(root, created);
  console.log(`  ~ abuddy.json (blocks.${type})`);
  if (regenerated) console.log(`\n  __generated__/ regenerated`);
}
