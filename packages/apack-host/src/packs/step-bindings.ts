import { _settingsJsonProblems } from '@apackdev/sdk/framework';
import type { StepDefinition } from '@apackdev/sdk/steps';
import { isPlainObject } from '@apackdev/sdk/utils/pure';

/** Copy declaration data while leaving executable component and function objects intact. */
export function captureStepBinding(step: StepDefinition): StepDefinition {
  if (!isPlainObject(step)) return step;
  const captured = { ...step };
  if (isPlainObject(captured.node)) captured.node = immutableData(captured.node, `Step "${captured.type}": node`);
  if (isPlainObject(captured.runtime)) captured.runtime = Object.freeze({ ...captured.runtime });
  if (isPlainObject(captured.fe)) {
    const fe = { ...captured.fe };
    if (isPlainObject(fe.nodeConfig)) {
      const config = { ...fe.nodeConfig };
      if (isPlainObject(config.connectionRules)) config.connectionRules = immutableData(config.connectionRules, `Step "${captured.type}": connectionRules`);
      fe.nodeConfig = Object.freeze(config);
    }
    if (isPlainObject(fe.components)) fe.components = Object.freeze({ ...fe.components });
    if (isPlainObject(fe.layout)) fe.layout = Object.freeze({ ...fe.layout });
    captured.fe = Object.freeze(fe);
  }
  return Object.freeze(captured);
}

function immutableData<T>(data: T, label: string): T {
  if (_settingsJsonProblems(data).length) throw new Error(`${label} must contain finite, acyclic JSON data properties`);
  const copy = structuredClone(data);
  function freeze(value: unknown): void {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  freeze(copy);
  return copy;
}
