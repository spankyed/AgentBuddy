import {cursorTimeline, viewportPoint} from './cursorTargets';
import type {CoordinateSpace, CursorPath, CursorTimelineMove, Point, TargetRect} from './cursorTargets';

/*
 * The cursor is the single source of truth for interaction.
 *
 * A scene declares ONE ordered list of `InteractionStep`s — where the cursor
 * moves and what it clicks. Both the rendered cursor AND every element state
 * (pressed, hovered, menu-open) are derived from that same list, so a click
 * and the element it acts on can never disagree. Never hand-code an
 * interaction-state frame again: ask the model.
 *
 * - movement  -> hover:  an element is hovered while the cursor's current
 *                        destination is that element (`hovered`).
 * - click     -> press:  an element is pressed in a short window around the
 *                        frame the cursor clicks it (`pressed`).
 * - click     -> effect: an overlay opens/closes on the click that triggers
 *                        it (`opens`/`closes` + `opened`).
 */

export type InteractionStep<T extends string> = Omit<CursorTimelineMove<T>, 'from'> & {
  /** Where the cursor travels from (a target or point); optional when `fromViewport` is set. */
  from?: CursorTimelineMove<T>['from'];
  /** Start position as viewport fractions [x, y] (used for the first step). */
  fromViewport?: Point;
  /** Overlay this step's click makes visible. */
  opens?: string;
  /** Overlay this step's click dismisses. */
  closes?: string;
  /** Human-readable label, for audits/debugging. */
  label?: string;
};

export type PressTiming = {lead: number; tail: number};

// A press is felt slightly before the cursor lands (the button reacts to the
// press-down) and held a few frames after — tied to the click frame, never
// authored independently.
export const DEFAULT_PRESS: PressTiming = {lead: 2, tail: 4};

export type InteractionModel<T extends string> = ReturnType<typeof createInteractionModel<T>>;

export function createInteractionModel<T extends string>(steps: Array<InteractionStep<T>>) {
  const clicks = steps.filter(step => step.click !== false);

  /** The frame the cursor clicks `target` (the last clicking step that targets it), or null. */
  function clickFrame(target: T): number | null {
    let frame: number | null = null;
    for (const step of clicks) if (step.to === target) frame = step.end;
    return frame;
  }

  /** Is `target` pressed at `frame`? True only in a window around a click on it. */
  function pressed(target: T, frame: number, timing: PressTiming = DEFAULT_PRESS): boolean {
    return clicks.some(step => step.to === target && frame >= step.end - timing.lead && frame < step.end + timing.tail);
  }

  /** Has the cursor clicked `target` by `frame` (optionally after a settle delay)? */
  function clicked(target: T, frame: number, settle = 0): boolean {
    const at = clickFrame(target);
    return at !== null && frame >= at + settle;
  }

  // Only target-named destinations count as hover targets (raw Points don't).
  const asTarget = (to: Point | T): T | null => (typeof to === 'string' ? to : null);

  /** The element the cursor is currently over: the active step's destination, or the parked one. */
  function destination(frame: number): T | null {
    const active = steps.find(step => frame >= step.start && frame < step.end);
    if (active) return asTarget(active.to);
    for (let index = 0; index < steps.length - 1; index += 1) {
      if (frame >= steps[index].end && frame < steps[index + 1].start) return asTarget(steps[index].to);
    }
    return null;
  }

  /** Is the cursor hovering `target` at `frame`? */
  function hovered(target: T, frame: number): boolean {
    return destination(frame) === target;
  }

  /** Is `overlay` open at `frame`? Open from its opener's click until its closer's click. */
  function opened(overlay: string, frame: number): boolean {
    let openAt: number | null = null;
    let closeAt: number | null = null;
    for (const step of clicks) {
      if (step.opens === overlay && step.end <= frame) openAt = step.end;
      if (step.closes === overlay && step.end <= frame) closeAt = step.end;
    }
    return openAt !== null && (closeAt === null || closeAt < openAt);
  }

  /** Cursor path for the scene, resolving any `fromViewport` start against the viewport. */
  function path(
    targets: Record<T, TargetRect>,
    frame: number,
    viewport: {height: number; width: number} = {height: 0, width: 0},
    space: CoordinateSpace = 'px',
  ): CursorPath | null {
    const resolved: Array<CursorTimelineMove<T>> = steps.map(step => ({
      ...step,
      from: step.fromViewport
        ? viewportPoint(viewport.width, viewport.height, step.fromViewport[0], step.fromViewport[1])
        : step.from!,
    }));
    return cursorTimeline(targets, resolved, frame, space);
  }

  return {clickFrame, clicked, destination, hovered, opened, path, pressed, steps};
}
