import type { StepDefinition } from '@abuddy/sdk/steps';
import { actionStepBuild } from './action/build.ts';
import { llmStepBuild } from './llm/build.ts';
import { switchStepBuild } from './switch/build.ts';
import { fireStepBuild } from './fire/build.ts';
import { transformStepBuild } from './transform/build.ts';
import { queryStepBuild } from './query/build.ts';
import { flowStepBuild } from './subflow/build.ts';
import { createStepBuild } from './create/build.ts';
import { updateStepBuild } from './update/build.ts';
import { keepAliveStepBuild } from './keep-alive/build.ts';
import { killStepBuild } from './kill/build.ts';
import { scheduleTriggerBuild } from './schedule/build.ts';
import { listenerTriggerBuild } from './listener/build.ts';

/**
 * Build-time step definitions (validate/compile/decompile, trigger facets) without
 * runtime handlers or FE. Bundled to build/steps.build.mjs so dependent packs'
 * `abuddy build` validates flows with the same code the host runs.
 */
export const steps: StepDefinition[] = [
  actionStepBuild,
  llmStepBuild,
  switchStepBuild,
  fireStepBuild,
  transformStepBuild,
  queryStepBuild,
  flowStepBuild,
  createStepBuild,
  updateStepBuild,
  keepAliveStepBuild,
  killStepBuild,
  scheduleTriggerBuild,
  listenerTriggerBuild,
];
