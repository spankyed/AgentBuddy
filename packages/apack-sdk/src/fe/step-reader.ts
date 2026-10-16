import { selectCatalogDeclaration, selectCatalogDeclarations } from '../framework/catalog-selection.ts';
import type { ComputedRef } from 'vue';
import { matchesFrontendDeclaration, onFrontendCatalogChanged, useFrontendDeclarations } from './catalog-bindings.ts';
import { boundFeHost } from '../runtime/fe-host.ts';
import type { StepCatalogEntry } from '../framework/catalog-view.ts';
import type { StepFrontendBinding } from './step-bindings.ts';

/** Selected declarations, including unavailable providers; ambiguous owners are not selected. */
export function getStepDeclarations(): readonly StepCatalogEntry[] {
  return selectCatalogDeclarations(boundFeHost().catalog.steps());
}

/** The same owner selection as getStepDeclarations, without activating a provider. */
export function getStepDeclaration(type: string): StepCatalogEntry | undefined {
  return selectCatalogDeclaration(type, boundFeHost().catalog.steps());
}

/** Executable binding only while its accepted identity matches the current enabled declaration. */
export function getStepBinding(type: string): StepFrontendBinding | undefined {
  const host = boundFeHost();
  if (host.catalog.status() !== 'ready') return undefined;
  const owner = getStepDeclaration(type);
  const accepted = host.packs.stepBindings().get(type);
  return matchesFrontendDeclaration(owner, accepted) ? accepted : undefined;
}

/** Observe independent declaration and executable publications without creating or loading a provider. */
export function onStepsChanged(listener: () => void): () => void {
  return onFrontendCatalogChanged(listener);
}

/** Scoped updates include readiness/binding changes even when declaration data is unchanged. */
export function useStepDeclarations(): ComputedRef<readonly StepCatalogEntry[]> {
  return useFrontendDeclarations('useStepDeclarations', getStepDeclarations);
}
