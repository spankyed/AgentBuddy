import * as path from 'node:path';
import { regenerateAfterScaffold } from '../generate-entries';
import { validateName, toPascalCase, toCamelCase, toLabel, writeIfNotExists, logCreated, hasFlag } from './write';
import { readManifest, writeManifest, addStep as addStepToManifest } from './manifest';
import { renderTemplate } from '../../templates.ts';



const HELP = `
Usage: abuddy add step <type> [options]

Options:
  --trigger    Create a trigger-type step instead of a regular step

Example:
  abuddy add step my-step
  abuddy add step my-trigger --trigger
`.trim();





// The flows editor renders a step's form with `node` and `resources` ({ actions, flows, models, prompts })
// and listens for `update-node` (the changed fields) and `close`

export async function addStep(args: string[], root: string) {
  if (hasFlag(args, '--help') || hasFlag(args, '-h')) {
    console.log(HELP);
    return;
  }

  const type = args[0];
  validateName(type, 'Step');

  const isTrigger = hasFlag(args, '--trigger');
  const camel = toCamelCase(type);
  const pascal = toPascalCase(type);
  const stepDir = path.join(root, 'src', 'extensions', 'steps', type);

  const created: string[] = [];
  const files: [string, string][] = [
    [path.join(stepDir, 'build.ts'), renderTemplate('pack/src/extensions/steps/step/build.ts', { TYPE: type, CAMEL: camel, PASCAL: pascal, LABEL: toLabel(type) })],
    [path.join(stepDir, 'fe.ts'), renderTemplate('pack/src/extensions/steps/step/fe.ts', { CAMEL: camel, LABEL: toLabel(type) })],
    [path.join(stepDir, 'types.ts'), renderTemplate('pack/src/extensions/steps/step/types.ts', { PASCAL: pascal, TYPE: type })],
    [path.join(stepDir, 'form.vue'), renderTemplate('pack/src/extensions/steps/step/form.vue', { PASCAL: pascal })],
  ];

  const dir = `src/extensions/steps/${type}`;
  const manifest = readManifest(root);
  addStepToManifest(manifest, type, {
    kind: isTrigger ? 'trigger' : 'step',
    // A trigger's build-time facet is its TriggerFacet; a step's is its StepBuildFacet
    ...(isTrigger
      ? { trigger: { facet: `${dir}/build.ts#${camel}StepBuild` } }
      : { build: `${dir}/build.ts#${camel}StepBuild` }),
    fe: `${dir}/fe.ts#${camel}StepFE`,
  });
  writeManifest(root, manifest);

  for (const [filePath, content] of files) {
    if (writeIfNotExists(filePath, content)) created.push(filePath);
  }

  const regenerated = await regenerateAfterScaffold(root);

  console.log(`\nCreated step "${type}":`);
  logCreated(root, created);
  console.log(`  ~ abuddy.json (steps.${type})`);
  if (regenerated) console.log(`\n  __generated__/ regenerated`);
}
