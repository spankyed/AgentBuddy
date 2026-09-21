import type { AnyActorRef } from 'xstate'

/**
 * A feature's own plugin actor, for what its `fe/public.ts` offers other features. The feature's machine binds it as
 * it starts; other features never hold the actor, only the reads and sends `public.ts` names.
 */
export function pluginHandle<T extends AnyActorRef = AnyActorRef>(feature: string) {
  let actor: T | undefined
  return {
    bind(self: AnyActorRef): void {
      actor = self as T
    },
    get(): T {
      if (!actor) throw new Error(`The ${feature} plugin isn't running`)
      return actor
    },
  }
}
