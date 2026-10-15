import { computed, getCurrentScope, onScopeDispose, shallowRef, type ComputedRef } from 'vue';
import { boundFeHost } from '../runtime/fe-host.ts';
import { declarationJson } from '../framework/declaration-data.ts';
import type { StepCatalogEntry } from '../framework/catalog-view.ts';
import type { StepFrontendBinding } from './step-bindings.ts';

/** A unique runtime owner takes precedence over authoring-source previews. */
function selectOwner(type: string, entries: readonly StepCatalogEntry[]): StepCatalogEntry | undefined {
  const owners = entries.filter(entry => entry.type === type);
  const runtime = owners.filter(entry => entry.origin !== 'source');
  const candidates = runtime.length ? runtime : owners;
  return candidates.length === 1 ? candidates[0] : undefined;
}

/** Selected declarations, including unavailable providers; ambiguous owners are not selected. */
export function getStepDeclarations(): readonly StepCatalogEntry[] {
  const entries = boundFeHost().catalog.steps();
  return Object.freeze([...new Set(entries.map(entry => entry.type))].flatMap(type => {
    const owner = selectOwner(type, entries);
    return owner ? [owner] : [];
  }));
}

/** The same owner selection as getStepDeclarations, without activating a provider. */
export function getStepDeclaration(type: string): StepCatalogEntry | undefined {
  return selectOwner(type, boundFeHost().catalog.steps());
}

/** Executable binding only while its accepted identity matches the current enabled declaration. */
export function getStepBinding(type: string): StepFrontendBinding | undefined {
  const host = boundFeHost();
  if (host.catalog.status() !== 'ready') return undefined;
  const owner = getStepDeclaration(type);
  if (!owner || owner.enabled !== true || owner.origin === 'source') return undefined;
  const accepted = host.packs.stepBindings().get(type);
  if (!accepted || accepted.packId !== owner.packId || accepted.binding.type !== type
    || declarationJson(owner.declaration) !== declarationJson(accepted.declaration)) return undefined;
  if (owner.origin === 'native') {
    return accepted.declarationRevision === undefined && accepted.buildRevision === undefined
      && accepted.runtimeRevision === undefined ? accepted : undefined;
  }
  return owner.declarationRevision && owner.buildRevision && accepted.runtimeRevision
    && owner.declarationRevision === accepted.declarationRevision && owner.buildRevision === accepted.buildRevision
    ? accepted : undefined;
}

/** Observe independent declaration and executable publications without creating or loading a provider. */
export function onStepsChanged(listener: () => void): () => void {
  const host = boundFeHost();
  const stopCatalog = host.catalog.subscribe(listener);
  try {
    const stopBindings = host.packs.onChanged(listener);
    return () => { stopCatalog(); stopBindings(); };
  } catch (error) {
    stopCatalog();
    throw error;
  }
}

/** Scoped updates include readiness/binding changes even when declaration data is unchanged. */
export function useStepDeclarations(): ComputedRef<readonly StepCatalogEntry[]> {
  if (!getCurrentScope()) throw new Error('useStepDeclarations requires an active Vue effect scope');
  const revision = shallowRef(0);
  onScopeDispose(onStepsChanged(() => { revision.value++; }));
  return computed(() => { revision.value; return getStepDeclarations(); });
}
