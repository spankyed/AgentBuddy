import type { StepDefinition } from '@abuddy/sdk/steps';
import { actionStep } from './action';
import { llmStep } from './llm';
import { switchStep } from './switch';
import { fireStep } from './fire';
import { transformStep } from './transform';
import { queryStep } from './query';
import { flowStep } from './flow';
import { createStep } from './create';
import { updateStep } from './update';
import { keepAliveStep } from './keep-alive';
import { killStep } from './kill';
import { scheduleTrigger } from './schedule';
import { listenerTrigger } from './listener';

export const standardSteps: StepDefinition[] = [
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
