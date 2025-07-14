import { computed, inject } from 'vue'
import { useSelector } from '@xstate/vue'
import { applicationState } from '@/app'
import type { EventObject, StateValue, ContextFrom, Actor } from 'xstate'

export function usePlugin<TContext = any, TEvents extends EventObject = EventObject>() {
  const pluginId = inject<string>('pluginId')
  
  if (!pluginId) {
    throw new Error('usePlugin must be used within a plugin component')
  }
  
  const actor = applicationState.system.get(pluginId) as Actor<any>
  
  if (!actor) {
    throw new Error(`Plugin actor not found: ${pluginId}`)
  }
  
  const context = useSelector(actor, (state) => state.context as TContext)
  const value = useSelector(actor, (state) => state.value as StateValue)
  
  const send = (event: TEvents) => {
    actor.send(event)
  }
  
  return {
    context,
    value,
    send,
    actor,
  }
}