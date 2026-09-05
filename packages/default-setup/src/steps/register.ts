import { stepRegistry } from '@abuddy/sdk/steps';
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

const standardSteps = [
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
];

export function registerStandardSteps(): void {
  for (const step of standardSteps) {
    stepRegistry.register(step);
  }
}
