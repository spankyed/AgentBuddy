import { applicationState } from '@/app'
import type { ActorRefFrom } from 'xstate'

export function useState<T>(pluginId: string): ActorRefFrom<T> {
  const actor = applicationState.system.get(pluginId) as ActorRefFrom<T>
  
  if (!actor) {
    throw new Error(`Plugin actor not found: ${pluginId}`)
  }
  
  return actor
}