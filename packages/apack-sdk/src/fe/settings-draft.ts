import { getCurrentScope, ref, watch, type Ref } from 'vue';
import { isPlainObject } from '../utils/shared.ts';

/**
 * An editable copy of a JSON settings field (or undefined), scoped to a component or effect scope.
 * Persisted changes replace the draft; equivalent snapshots preserve pending edits. Saving remains explicit.
 */
export function useSettingsDraft<T>(read: () => T): Ref<T> {
  if (!getCurrentScope()) throw new Error('useSettingsDraft runs in a component or an effect scope: disposal stops it following settings');
  // Stable object keys keep equivalent snapshots from discarding edits; array order remains significant.
  const serialize = () => JSON.stringify(read(), (_key, value) => isPlainObject(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
  const deserialize = (value: string | undefined): T => value === undefined ? undefined as T : JSON.parse(value);
  const draft = ref(deserialize(serialize())) as Ref<T>;
  watch(serialize, value => { draft.value = deserialize(value); });
  return draft;
}
