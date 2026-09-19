import { safeEvents } from './safe-events.ts';

export type TrailClickEvent<TInfo = unknown> = { type: 'TRAIL_CLICK'; target: string; info?: TInfo };

const typeOf = safeEvents<TrailClickEvent>();

export const targetIs = ({ event }: { event: { type: string } }, params: { view: string }) =>
  typeOf('TRAIL_CLICK', event as TrailClickEvent).target === params.view;

type TransitionConfig = object;
type RouteTuple = [string, string];

export function TRAIL_CLICK<T extends TransitionConfig>(routes: RouteTuple[]) {
  return {
    ['TRAIL_CLICK' as keyof T]: routes.map(([target, view]) => ({
      guard: { type: 'targetIs', params: { view } },
      target,
    }))
  }
}
