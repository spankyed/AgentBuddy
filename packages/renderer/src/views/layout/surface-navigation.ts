import { computed, onScopeDispose, shallowRef } from 'vue';
import { useSelector } from '@xstate/vue';
import { surfaceNavigationItems } from '@apackdev/host/fe';
import { applicationState } from '@/main';
import { windowCatalog } from '@/runtime/catalog';
import { fePacks } from '@/runtime/packs';

/** Observe declarations and runtime icons independently, without keeping a second surface inventory. */
export function useSurfaceNavigation() {
  const revision = shallowRef(0);
  onScopeDispose(windowCatalog.subscribe(() => { revision.value++; }));
  const context = useSelector(applicationState, state => state.context);
  return computed(() => {
    void revision.value;
    return surfaceNavigationItems(windowCatalog, fePacks.surfaceBindings(), context.value.surfaceVisibility);
  });
}
