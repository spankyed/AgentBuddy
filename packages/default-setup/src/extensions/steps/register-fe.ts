import type { StepDefinition } from '@abuddy/sdk/steps';
import { actionStepFE } from './action/fe';
import { llmStepFE } from './llm/fe';
import { switchStepFE } from './switch/fe';
import { fireStepFE } from './fire/fe';
import { transformStepFE } from './transform/fe';
import { queryStepFE } from './query/fe';
import { flowStepFE } from './flow/fe';
import { createStepFE } from './create/fe';
import { updateStepFE } from './update/fe';
import { keepAliveStepFE } from './keep-alive/fe';
import { killStepFE } from './kill/fe';
import { scheduleTriggerFE } from './schedule/fe';
import { listenerTriggerFE } from './listener/fe';

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
