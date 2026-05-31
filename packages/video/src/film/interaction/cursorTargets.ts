export type Point = [number, number];

export type CoordinateSpace = 'percent' | 'px';

export type TargetRect = {
  height: number;
  left: number;
  top: number;
  width: number;
};

export type TargetPointOptions = {
  /**
   * 0..1 position inside the rect. Defaults to center.
   */
  anchor?: Point;
  /**
   * Coordinate-space nudge after anchor resolution.
   */
  offset?: Point;
};

export type CursorPath = {
  click?: boolean;
  coordinateSpace?: CoordinateSpace;
  end: number;
  fade?: boolean;
  from: Point;
  start: number;
  to: Point;
};

export type TargetedCursorMove<TargetId extends string> = {
  click?: boolean;
  end: number;
  from: Point | TargetId;
  fromPoint?: TargetPointOptions;
  start: number;
  to: Point | TargetId;
  toPoint?: TargetPointOptions;
};

export type CursorTimelineMove<TargetId extends string> = TargetedCursorMove<TargetId> & {
  holdUntilNext?: boolean;
};

export function percentTarget(left: number, top: number, width = 0, height = 0): TargetRect {
  return {height, left, top, width};
}

export function viewportPoint(width: number, height: number, x: number, y: number): Point {
  return [width * x, height * y];
}

export function targetPoint(rect: TargetRect, options: TargetPointOptions = {}): Point {
  const [anchorX, anchorY] = options.anchor ?? [0.5, 0.5];
  const [offsetX, offsetY] = options.offset ?? [0, 0];
  return [
    rect.left + rect.width * anchorX + offsetX,
    rect.top + rect.height * anchorY + offsetY,
  ];
}

export function cursorMove<TargetId extends string>(
  targets: Record<TargetId, TargetRect>,
  move: TargetedCursorMove<TargetId>,
  coordinateSpace: CoordinateSpace = 'px',
): CursorPath {
  return {
    click: move.click,
    coordinateSpace,
    end: move.end,
    from: resolvePoint(targets, move.from, move.fromPoint),
    start: move.start,
    to: resolvePoint(targets, move.to, move.toPoint),
  };
}

export function cursorTimeline<TargetId extends string>(
  targets: Record<TargetId, TargetRect>,
  moves: Array<CursorTimelineMove<TargetId>>,
  frame: number,
  coordinateSpace: CoordinateSpace = 'px',
): CursorPath | null {
  const resolvedMoves = moves.map(move => cursorMove(targets, move, coordinateSpace));
  const activeIndex = resolvedMoves.findIndex(move => frame >= move.start && frame < move.end);
  if (activeIndex >= 0) {
    return {
      ...resolvedMoves[activeIndex],
      fade: false,
    };
  }

  for (let index = 0; index < resolvedMoves.length - 1; index += 1) {
    const current = resolvedMoves[index];
    const next = resolvedMoves[index + 1];
    if (frame >= current.end && frame < next.start && moves[index].holdUntilNext !== false) {
      return {
        click: false,
        coordinateSpace,
        end: next.start,
        fade: false,
        from: current.to,
        start: current.end,
        to: current.to,
      };
    }
  }

  return null;
}

export function targetDebugOverlay<TargetId extends string>(
  targets: Record<TargetId, TargetRect>,
) {
  return Object.entries(targets).map(([id, rect]) => ({id, rect: rect as TargetRect}));
}

function resolvePoint<TargetId extends string>(
  targets: Record<TargetId, TargetRect>,
  pointOrTarget: Point | TargetId,
  options?: TargetPointOptions,
): Point {
  if (Array.isArray(pointOrTarget)) return pointOrTarget;
  return targetPoint(targets[pointOrTarget], options);
}
