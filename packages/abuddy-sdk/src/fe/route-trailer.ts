import { safeEvents } from './safe-events.js';

export type TrailClickEvent = { type: 'TRAIL_CLICK'; target: string; info?: any };

const typeOf = safeEvents<TrailClickEvent>();

export const targetIs = ({ event }: any, params: { view: string }) => typeOf('TRAIL_CLICK', event).target === params.view;

type TransitionConfig = any;
type RouteTuple = [string, string];

export function TRAIL_CLICK<T extends TransitionConfig>(routes: RouteTuple[]) {
  return {
    ['TRAIL_CLICK' as keyof T]: routes.map(([target, view]) => ({
      guard: { type: 'targetIs', params: { view } },
      target,
    }))
  }
}
