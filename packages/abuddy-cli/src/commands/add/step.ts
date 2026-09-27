import * as path from 'node:path';
import { regenerateAfterScaffold } from '../generate-entries';
import { validateName, toPascalCase, toCamelCase, toLabel, writeIfNotExists, logCreated, hasFlag, updateRegisterArray } from './templates';
import { readManifest, writeManifest, addStepDefinition } from './manifest';
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
    [path.join(stepDir, 'index.ts'), renderTemplate('pack/src/extensions/steps/step/index.ts', { CAMEL: camel })],
    [path.join(stepDir, 'fe.ts'), renderTemplate('pack/src/extensions/steps/step/fe.ts', { TYPE: type, CAMEL: camel, LABEL: toLabel(type) })],
    [path.join(stepDir, 'types.ts'), renderTemplate('pack/src/extensions/steps/step/types.ts', { PASCAL: pascal, TYPE: type })],
    [path.join(stepDir, 'form.vue'), renderTemplate('pack/src/extensions/steps/step/form.vue', { PASCAL: pascal })],
  ];

  for (const [filePath, content] of files) {
    if (writeIfNotExists(filePath, content)) created.push(filePath);
  }

  const manifest = readManifest(root);
  // Sets steps.register for a pack with no steps yet
  addStepDefinition(manifest, {
    type,
    path: `src/extensions/steps/${type}`,
    kind: isTrigger ? 'trigger' : 'step',
  });
  const stepsConfig = manifest.steps!;
  const registerPath = stepsConfig.register;
  // A pack not made by `abuddy init` may have no step lists yet
  for (const [file, template] of [[registerPath, renderTemplate('pack/src/extensions/steps/register.ts')], [stepsConfig.build, renderTemplate('pack/src/extensions/steps/build.ts')]] as const) {
    if (file && writeIfNotExists(path.join(root, file), template)) created.push(path.join(root, file));
  }

  if (registerPath) {
    const exportName = `${camel}Step`;

    updateRegisterArray(
      path.join(root, registerPath),
      `import { ${exportName} } from './${type}/index.ts';`,
      `  ${exportName},\n`,
    );

    const feRegisterPath = registerPath.replace(/\.ts$/, '-fe.ts');
    const feExportName = `${camel}StepFE`;
    updateRegisterArray(
      path.join(root, feRegisterPath),
      `import { ${feExportName} } from './${type}/fe.ts';`,
      `  ${feExportName},\n`,
    );
  }

  if (stepsConfig.build) {
    updateRegisterArray(
      path.join(root, stepsConfig.build),
      `import { ${camel}StepBuild } from './${type}/build.ts';`,
      `  ${camel}StepBuild,\n`,
    );
  }

  writeManifest(root, manifest);

  const regenerated = await regenerateAfterScaffold(root);

  console.log(`\nCreated step "${type}":`);
  logCreated(root, created);
  if (regenerated) console.log(`\n  manifest + register files updated, __generated__/ regenerated`);
}
