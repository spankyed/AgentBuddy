import * as path from 'node:path';
import { regenerateAfterScaffold } from '../generate-entries';
import { validateName, toPascalCase, toCamelCase, toLabel, writeIfNotExists, logCreated, hasFlag } from './write';
import { readManifest, writeManifest, addStep as addStepToManifest } from './manifest';
import { renderTemplate } from '../../templates.ts';



const HELP = `
Usage: apack add step <type> [options]

Options:
  --trigger    Create a trigger-type step instead of a regular step

Example:
  apack add step my-step
  apack add step my-trigger --trigger
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

  // A trigger is not a step with a flag set: it owns a DSL track rather than a node in one, so its
  // build-time facet is a `TriggerFacet` and comes from its own template. Pointing its manifest entry at
  // the step template's `StepBuildFacet` is a pack that does not typecheck.
  const facetFile = isTrigger ? 'trigger' : 'build';
  const facetExport = isTrigger ? `${camel}TriggerBuild` : `${camel}StepBuild`;
  const nodeExport = isTrigger ? `${camel}TriggerNode` : `${camel}StepNode`;
  const feExport = isTrigger ? `${camel}TriggerFE` : `${camel}StepFE`;

  const created: string[] = [];
  // Each branch names its templates literally, which is how `scaffold-templates.spec.ts` sees that a
  // template under `templates/` has a caller at all — a computed path is invisible to it. The two differ in
  // what they take, too: `renderTemplate` refuses a variable the template has no placeholder for.
  const files: [string, string][] = isTrigger
    ? [
      [path.join(stepDir, 'trigger.ts'), renderTemplate('pack/src/extensions/steps/step/trigger.ts', { TYPE: type, CAMEL: camel, LABEL: toLabel(type) })],
      [path.join(stepDir, 'fe.ts'), renderTemplate('pack/src/extensions/steps/step/trigger-fe.ts', { CAMEL: camel })],
      [path.join(stepDir, 'types.ts'), renderTemplate('pack/src/extensions/steps/step/types.ts', { PASCAL: pascal, TYPE: type })],
      [path.join(stepDir, 'form.vue'), renderTemplate('pack/src/extensions/steps/step/form.vue', { PASCAL: pascal })],
    ]
    : [
      [path.join(stepDir, 'build.ts'), renderTemplate('pack/src/extensions/steps/step/build.ts', { TYPE: type, CAMEL: camel, PASCAL: pascal, LABEL: toLabel(type) })],
      [path.join(stepDir, 'fe.ts'), renderTemplate('pack/src/extensions/steps/step/fe.ts', { CAMEL: camel })],
      [path.join(stepDir, 'types.ts'), renderTemplate('pack/src/extensions/steps/step/types.ts', { PASCAL: pascal, TYPE: type })],
      [path.join(stepDir, 'form.vue'), renderTemplate('pack/src/extensions/steps/step/form.vue', { PASCAL: pascal })],
    ];

  const dir = `src/extensions/steps/${type}`;
  const manifest = readManifest(root);
  addStepToManifest(manifest, type, {
    kind: isTrigger ? 'trigger' : 'step',
    // Both halves read `node`, so it sits beside the build-time facet where no Vue import reaches it
    node: `${dir}/${facetFile}.ts#${nodeExport}`,
    ...(isTrigger
      ? { trigger: { facet: `${dir}/${facetFile}.ts#${facetExport}` } }
      : { build: `${dir}/${facetFile}.ts#${facetExport}` }),
    fe: `${dir}/fe.ts#${feExport}`,
  });
  writeManifest(root, manifest);

  for (const [filePath, content] of files) {
    if (writeIfNotExists(filePath, content)) created.push(filePath);
  }

  const regenerated = await regenerateAfterScaffold(root);

  console.log(`\nCreated step "${type}":`);
  logCreated(root, created);
  console.log(`  ~ apack.json (steps.${type})`);
  if (regenerated) console.log(`\n  __generated__/ regenerated`);
}
