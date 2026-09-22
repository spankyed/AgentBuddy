import { computed, defineComponent, inject, provide, type ComputedRef, type InjectionKey } from 'vue'
import type { AnyActorRef } from 'xstate'
import { splitRef } from '../ids/refs.ts'
import { boundFeHost } from '../runtime/fe-host.ts'

const PLUGIN: InjectionKey<ComputedRef<AnyActorRef>> = Symbol('plugin')

/** The application actor: the app shell, which lists the plugins and holds which is open */
export function useApplicationActor(): AnyActorRef {
  return inject<AnyActorRef>('applicationActor')!
}

/**
 * The actor of the plugin this component belongs to. The host provides it where it renders a plugin's canvas,
 * panel and chat, and `PluginScope` where a plugin's component is rendered elsewhere (its settings, in the settings
 * plugin). Another plugin's state is that plugin's to expose, not a lookup away.
 */
export function usePlugin<T = AnyActorRef>(): T {
  const plugin = inject(PLUGIN, undefined)
  if (!plugin) throw new Error('usePlugin() runs in a component a plugin renders: its canvas, panel or chat, or one inside a <PluginScope>')
  return plugin.value as T
}

/** The running actor of the plugin at `ref`, a registered plugin's `<packId>/<featureId>` */
function pluginActor(ref: string): AnyActorRef {
  if (!splitRef(ref)) throw new Error(`"${ref}" doesn't name a plugin: a plugin is named "<packId>/<featureId>"`)
  const actor = boundFeHost().application.system.get(ref) as AnyActorRef | undefined
  if (!actor) throw new Error(`No plugin is running at "${ref}"`)
  return actor
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
