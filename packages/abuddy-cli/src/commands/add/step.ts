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

// Build-time facet: no FE or runtime imports, so it can ship in build/steps.build.mjs
const BUILD = (type: string, camel: string, pascal: string) => `import type { StepDefinition, StepCompileResult, StepValidationError } from '@abuddy/sdk/steps';
import { EARS } from '@abuddy/sdk';
import type { DSL${pascal}Node } from './types.ts';

export const ${camel}StepBuild: StepDefinition = {
  type: '${type}',
  build: {
    compile(node, nodeId, ts): StepCompileResult {
      const step = node as unknown as DSL${pascal}Node;
      return {
        entity: { id: nodeId, entityType: EARS.Entity.Node, createdAt: ts, nodeType: '${type}', label: step.label ?? '${toLabel(type)}' },
        relations: [],
      };
    },
    validate(): StepValidationError[] {
      return [];
    },
    getLabel(node, index) {
      return typeof node.label === 'string' ? node.label : \`${toLabel(type)} \${index}\`;
    },
  },
};
`;

const INDEX = (camel: string) => `import type { StepDefinition } from '@abuddy/sdk/steps';
import { ${camel}StepBuild } from './build.ts';
import { ${camel}StepFE } from './fe.ts';

export const ${camel}Step: StepDefinition = {
  ...${camel}StepBuild,
  fe: ${camel}StepFE.fe,
};
`;

const FE = (type: string, camel: string) => `import type { StepDefinition } from '@abuddy/sdk/steps';
import { defineAsyncComponent } from 'vue';
import { Box } from 'lucide-vue-next';

export const ${camel}StepFE: StepDefinition = {
  type: '${type}',
  fe: {
    loadComponents: () => ({ form: defineAsyncComponent(() => import('./form.vue')) }),
    nodeConfig: {
      label: '${toLabel(type)}',
      icon: Box,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-700/20',
      hoverBgColor: 'group-hover:bg-indigo-700/30',
      connectionRules: { inputs: -1, outputs: -1 },
      category: 'logic',
      isImplemented: true,
    },
  },
};
`;

// generate-entries types a `dsl.primaryField` helper's options from the first `DSL…Node` interface,
// and adds each `… extends NodeBase` interface to the pack's Node row union
const TYPES = (pascal: string, type: string) => `import type { NodeBase } from '@abuddy/sdk';
import type { DSLNodeBase } from '@abuddy/sdk/build';

export interface DSL${pascal}Node extends DSLNodeBase {
  type: '${type}';
  label?: string;
}

export interface ${pascal}Node extends NodeBase {
  nodeType: '${type}';
}
`;

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
    [path.join(stepDir, 'build.ts'), BUILD(type, camel, pascal)],
    [path.join(stepDir, 'index.ts'), INDEX(camel)],
    [path.join(stepDir, 'fe.ts'), FE(type, camel)],
    [path.join(stepDir, 'types.ts'), TYPES(pascal, type)],
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
