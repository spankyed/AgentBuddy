import { computed, defineComponent, inject, provide, type ComputedRef, type InjectionKey } from 'vue'
import type { AnyActorRef } from 'xstate'
import { splitRef } from '../ids/refs.ts'
import { _runDelivery } from '../events/delivery.ts'
import { boundFeHost } from '../runtime/fe-host.ts'

const PLUGIN: InjectionKey<ComputedRef<AnyActorRef>> = Symbol('plugin')

/**
 * The actor of the plugin this component belongs to. The host provides it where it renders a plugin's canvas,
 * panel and chat, and `PluginScope` where a plugin's component is rendered elsewhere (its settings, in the settings
 * plugin). Another plugin's state is read with `useUntypedPluginState`/`readUntypedPluginState`, which name it by ref and hand
 * back a value rather than its actor.
 *
 * Which plugin a component belongs to is where it is rendered, not anything at the call site, so the type is the
 * caller's to name — `usePlugin<MemosActor>()`, or a typed binding it is inferred from. It has no default: one
 * would be `any` in all but name, and a component that never named its plugin would read a context field the
 * machine dropped, and keep compiling.
 */
export function usePlugin<T>(): T {
  const plugin = inject(PLUGIN, undefined)
  if (!plugin) throw new Error('usePlugin() runs in a component a plugin renders: its canvas, panel or chat, or one inside a <PluginScope>')
  return sendsAsItself(plugin.value) as T
}

/**
 * One wrapper per actor, so two `usePlugin()` calls in one component hand back the same object. Keyed on the
 * actor, so it goes when the actor does.
 */
const wrappers = new WeakMap<AnyActorRef, AnyActorRef>()

/**
 * The actor, with a send that says which plugin made it.
 *
 * A component sending to its own plugin is the one path that reaches a machine's actions from outside a
 * delivery: the bus names the message it routes to a system, and the shell names the one it hands a plugin, but
 * a click goes straight to the actor. So an action that then sent to a system stamped no `Message.sender`, and
 * the system answering it with `reply` had no address and threw — for the commonest kind of request in the app.
 *
 * Running the send inside a delivery closes that: the action's own `sendToSystem` reads the scope and stamps
 * this plugin's ref, so the system answers *this* plugin in the window it was asked from. `actor.id` is that
 * ref because the shell spawns a plugin with its ref as both `id` and `systemId`.
 *
 * Only `send` is wrapped, and everything else is passed through bound to the actor — checked rather than
 * assumed: `useSelector` stays reactive through it, and `subscribe` and `getSnapshot` behave as before.
 */
function sendsAsItself(actor: AnyActorRef): AnyActorRef {
  const existing = wrappers.get(actor)
  if (existing) return existing
  const wrapper = new Proxy(actor, {
    get(target, prop, receiver) {
      if (prop === 'send') {
        return (event: unknown) => _runDelivery({ receiver: target.id }, () => target.send(event as never))
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
  wrappers.set(actor, wrapper)
  return wrapper
}

/**
 * The running actor of the plugin at `ref`, a registered plugin's `<packId>/<featureId>`.
 *
 * Not exported from `@abuddy/sdk/fe`: pack code reads a plugin through `useUntypedPluginState`/`readUntypedPluginState` and
 * sends to one through the generated sends, so no pack holds another plugin's actor.
 */
export function pluginActor(ref: string): AnyActorRef {
  const actor = pluginActorIfRunning(ref)
  if (!actor) throw new Error(`No plugin is running at "${ref}"`)
  return actor
}

/**
 * The same, or undefined when nothing is running at `ref` yet. A pack's own plugins are all spawned in the step
 * that registers them, so absence means another pack whose frontend is still loading — a state to render, not a
 * bug. The readers in `plugin-state.ts` use this; `PluginScope` uses `pluginActor`, where a missing plugin means
 * the component was mounted for one that doesn't exist.
 */
export function pluginActorIfRunning(ref: string): AnyActorRef | undefined {
  if (!splitRef(ref)) throw new Error(`"${ref}" doesn't name a plugin: a plugin is named "<packId>/<featureId>"`)
  return boundFeHost().application.system.get(ref)
}

/**
 * Renders its slot as part of the plugin at `plugin` (a registered plugin's `<packId>/<featureId>`), so
 * `usePlugin()` in it returns that plugin's actor: for a plugin's component rendered outside its own areas, such as
 * its settings in the settings plugin.
 */
export const PluginScope = defineComponent({
  name: 'PluginScope',
  props: { plugin: { type: String, required: true } },
  setup(props, { slots }) {
    provide(PLUGIN, computed(() => pluginActor(props.plugin)))
    return () => slots.default?.()
  },
})
