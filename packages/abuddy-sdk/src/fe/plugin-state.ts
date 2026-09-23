// Reading another plugin's state, for code that isn't inside that plugin's own components.
//
// `usePlugin()` answers "the plugin I am rendered by", which needs a `PluginScope`. Extension components —
// artifact viewers, tiptap command items, step forms — are rendered by the host wherever they belong, with no
// such scope, and a feature's `fe/public.ts` is read from other features too. Both reach a plugin by its ref.
//
// The actor comes from the shell's registry, which is the app's one list of running plugins: a plugin is
// spawned with its ref as its XState `systemId`. Nothing here keeps its own.
import { getCurrentScope, onScopeDispose, shallowReadonly, shallowRef, type Ref } from 'vue'
import { pluginActor } from './actor-system.ts'

/**
 * A value from the state of the plugin at `ref`, following it until the calling scope is disposed. So it runs in a
 * component's setup or an effect scope, never inside a `computed` — `readPluginState` is the one-shot read.
 *
 * The snapshot's type is the caller's to name, since only it knows which plugin the ref belongs to:
 *
 * ```ts
 * usePluginState(ref('notes'), (s: SnapshotFrom<NotesState>) => s.context.notes)
 * ```
 *
 * Throws when no plugin is running at `ref` — within a pack that is a bug rather than a state to render, since the
 * pack ships both features. A ref that may be absent (another pack's) is checked with `hasDesignation` first.
 */
export function usePluginState<TSnapshot, TSelected>(
  ref: string,
  selector: (snapshot: TSnapshot) => TSelected,
): Readonly<Ref<TSelected>> {
  if (!getCurrentScope()) {
    throw new Error(`usePluginState("${ref}") runs in a component's setup or an effect scope: its ref follows the plugin until that scope is disposed. Outside one, read it once with readPluginState()`)
  }
  const actor = pluginActor(ref)
  const selected = shallowRef(selector(actor.getSnapshot() as TSnapshot))
  const subscription = actor.subscribe((snapshot: unknown) => {
    const next = selector(snapshot as TSnapshot)
    // Only a changed value writes the ref, so a component reading one field isn't re-rendered for another
    if (next !== selected.value) selected.value = next
  })
  onScopeDispose(() => subscription.unsubscribe())
  return shallowReadonly(selected) as Readonly<Ref<TSelected>>
}

/**
 * The same read, once, for code outside a reactive scope — a machine's action, an event handler. It takes the value
 * as it is now and never follows it.
 */
export function readPluginState<TSnapshot, TSelected>(
  ref: string,
  selector: (snapshot: TSnapshot) => TSelected,
): TSelected {
  return selector(pluginActor(ref).getSnapshot() as TSnapshot)
}
