import { computed, onScopeDispose, shallowRef } from 'vue';
import { useSelector } from '@xstate/vue';
import { pluginNavigationItems } from '@apackdev/host/fe';
import { applicationState } from '@/main';
import { windowCatalog } from '@/runtime/catalog';
import { fePacks } from '@/runtime/packs';

/** Observe declarations and runtime icons independently, without keeping a second plugin inventory. */
export function usePluginNavigation() {
  const revision = shallowRef(0);
  onScopeDispose(windowCatalog.subscribe(() => { revision.value++; }));
  const context = useSelector(applicationState, state => state.context);
  return computed(() => {
    revision.value;
    return pluginNavigationItems(windowCatalog, fePacks.pluginBindings(), context.value.pluginVisibility);
  });
}
