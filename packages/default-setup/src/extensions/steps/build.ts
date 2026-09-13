import type { StepDefinition } from '@abuddy/sdk/steps';
import { actionStepBuild } from './action/build';
import { llmStepBuild } from './llm/build';
import { switchStepBuild } from './switch/build';
import { fireStepBuild } from './fire/build';
import { transformStepBuild } from './transform/build';
import { queryStepBuild } from './query/build';
import { flowStepBuild } from './subflow/build';
import { createStepBuild } from './create/build';
import { updateStepBuild } from './update/build';
import { keepAliveStepBuild } from './keep-alive/build';
import { killStepBuild } from './kill/build';
import { scheduleTriggerBuild } from './schedule/build';
import { listenerTriggerBuild } from './listener/build';

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
