import { applicationState } from '@/app'
import type { ActorRefFrom } from 'xstate'

export function useState<TActor extends ActorRefFrom<any>>(pluginId: string): TActor {
  const actor = applicationState.system.get(pluginId) as TActor
  
  if (!actor) {
    throw new Error(`Plugin actor not found: ${pluginId}`)
  }
  
  return actor
}