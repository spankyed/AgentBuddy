import { computed } from 'vue';
import { useSelector } from '@xstate/vue';

/**
 * Creates a writable computed property for managing collapsible section state
 * @param actor - The XState actor to send events to
 * @param path - Path to the state value in the context (e.g., ['create', 'tagsExpanded'])
 * @param eventType - The event type to send when toggling (e.g., 'TOGGLE_TAGS_SECTION')
 * @returns A computed property that can be used with v-model
 */
export function useCollapsibleState(actor: any, path: string[], eventType: string) {
  // Get the reactive state from the actor
  const state = useSelector(actor, (state: any) => {
    // Navigate through the path to get the value
    let value: any = state.context;
    for (const key of path) {
      value = value?.[key];
    }
    return Boolean(value);
  });
  
  // Return a computed property that can be used with v-model
  return computed({
    get: () => state.value,
    set: (value: boolean) => actor.send({ type: eventType, show: value })
  });
}