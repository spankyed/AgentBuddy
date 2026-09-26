import type { StepDefinition } from '@abuddy/sdk/steps';
import { actionStep } from './action/index.ts';
import { llmStep } from './llm/index.ts';
import { switchStep } from './switch/index.ts';
import { fireStep } from './fire/index.ts';
import { transformStep } from './transform/index.ts';
import { queryStep } from './query/index.ts';
import { flowStep } from './subflow/index.ts';
import { createStep } from './create/index.ts';
import { updateStep } from './update/index.ts';
import { keepAliveStep } from './keep-alive/index.ts';
import { killStep } from './kill/index.ts';
import { scheduleTrigger } from './schedule/index.ts';
import { listenerTrigger } from './listener/index.ts';

export const steps: StepDefinition[] = [
  actionStep,
  llmStep,
  switchStep,
  fireStep,
  transformStep,
  queryStep,
  flowStep,
  createStep,
  updateStep,
  keepAliveStep,
  killStep,
  scheduleTrigger,
  listenerTrigger,
];
