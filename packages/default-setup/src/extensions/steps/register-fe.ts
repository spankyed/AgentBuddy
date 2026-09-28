import type { StepDefinition } from '@abuddy/sdk/steps';
import { actionStepFE } from './action/fe.ts';
import { llmStepFE } from './llm/fe.ts';
import { switchStepFE } from './switch/fe.ts';
import { fireStepFE } from './fire/fe.ts';
import { transformStepFE } from './transform/fe.ts';
import { queryStepFE } from './query/fe.ts';
import { flowStepFE } from './subflow/fe.ts';
import { createStepFE } from './create/fe.ts';
import { updateStepFE } from './update/fe.ts';
import { keepAliveStepFE } from './keep-alive/fe.ts';
import { killStepFE } from './kill/fe.ts';
import { scheduleTriggerFE } from './schedule/fe.ts';
import { listenerTriggerFE } from './listener/fe.ts';

export const stepsFE: StepDefinition[] = [
  actionStepFE,
  llmStepFE,
  switchStepFE,
  fireStepFE,
  transformStepFE,
  queryStepFE,
  flowStepFE,
  createStepFE,
  updateStepFE,
  keepAliveStepFE,
  killStepFE,
  scheduleTriggerFE,
  listenerTriggerFE,
];
