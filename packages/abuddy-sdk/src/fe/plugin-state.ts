// Reading another plugin's state by ref, untyped: the escape hatch beside the typed readers `#generated/fe`
// generates from each plugin's contract, as `untypedQx` is beside `qx`.
//
// `usePlugin()` answers "the plugin I am rendered by", which needs a `PluginScope`. Extension components —
// artifact viewers, tiptap command items, step forms — are rendered by the host wherever they belong, with no such
// scope. They reach a plugin by its ref instead.
//
// Both return `TSelected | undefined`, because a ref is a name and nothing about a name says the plugin is running:
// another pack's frontend may still be loading. The generated readers narrow that away for a plugin in the calling
// pack, which is spawned in the step that registers it — codegen knows which case it is, and a caller here doesn't.
//
// The actor comes from the shell's registry, the app's one list of running plugins: a plugin is spawned with its
// ref as its XState `systemId`. Nothing here keeps its own.
import { getCurrentScope, onScopeDispose, shallowReadonly, shallowRef, type Ref } from 'vue'
import { boundFeHost } from '../runtime/fe-host.ts'
import { pluginActorIfRunning } from './actor-system.ts'

/** Whether a plugin is running at `ref` in this window. What a reader hands back is `undefined` until it is. */
export function pluginIsRunning(ref: string): boolean {
  return pluginActorIfRunning(ref) !== undefined
}

/**
 * A value from the state of the plugin at `ref`, following it until the calling scope is disposed. So it runs in a
 * component's setup or an effect scope, never inside a `computed` — `readUntypedPluginState` is the one-shot read.
 *
 * The snapshot's type is the caller's to name, since only it knows which plugin the ref belongs to:
 *
 * ```ts
 * useUntypedPluginState(ref('notes'), (s: SnapshotFrom<NotesState>) => s.context.notes)
 * ```
 *
 * It follows the plugin *arriving* as well as changing: a read made while another pack's frontend is still loading
 * starts `undefined` and fills in once that pack registers its plugins, and one whose pack reloads follows the new
 * actor. Both are the shell's doing, so the shell's own snapshot is what says to look again.
 */
export function useUntypedPluginState<TSnapshot, TSelected>(
  ref: string,
  selector: (snapshot: TSnapshot) => TSelected,
): Readonly<Ref<TSelected | undefined>> {
  if (!getCurrentScope()) {
    throw new Error(`useUntypedPluginState("${ref}") runs in a component's setup or an effect scope: its ref follows the plugin until that scope is disposed. Outside one, read it once with readUntypedPluginState()`)
  }
  // A `shallowRef` triggers only when the value it is given actually changed, so a component reading one field
  // isn't re-rendered because another moved. Comparing here first would only repeat that.
  const selected = shallowRef<TSelected | undefined>(undefined)
  let followed: ReturnType<typeof pluginActorIfRunning>
  let subscription: { unsubscribe(): void } | undefined

  /** Follow whatever is running at `ref` now; cheap and idempotent while that is the same actor */
  const follow = () => {
    const actor = pluginActorIfRunning(ref)
    if (actor === followed) return
    subscription?.unsubscribe()
    followed = actor
    if (!actor) {
      subscription = undefined
      selected.value = undefined
      return
    }
    selected.value = selector(actor.getSnapshot() as TSnapshot)
    subscription = actor.subscribe((snapshot: unknown) => {
      selected.value = selector(snapshot as TSnapshot)
    })
  }

  follow()
  const shell = boundFeHost().application.subscribe(() => follow())
  onScopeDispose(() => {
    shell.unsubscribe()
    subscription?.unsubscribe()
  })
  return shallowReadonly(selected) as Readonly<Ref<TSelected | undefined>>
}

/**
 * The same read, once, for code outside a reactive scope — a machine's action, an event handler. It takes the value
 * as it is now and never follows it, so a plugin that isn't running yet reads as `undefined` rather than later.
 */
export function readUntypedPluginState<TSnapshot, TSelected>(
  ref: string,
  selector: (snapshot: TSnapshot) => TSelected,
): TSelected | undefined {
  const actor = pluginActorIfRunning(ref)
  return actor ? selector(actor.getSnapshot() as TSnapshot) : undefined
}
