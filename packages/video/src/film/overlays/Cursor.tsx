import {ease, mix} from '../state/timeline';

type CursorProps = {
  click?: boolean;
  end: number;
  frame: number;
  from: [number, number];
  start: number;
  to: [number, number];
};

export function Cursor({click = true, end, frame, from, start, to}: CursorProps) {
  const p = ease(frame, start, end);
  const [x, y] = cursorPoint(from, to, p);
  const clickAmount = click ? Math.sin(ease(frame, end - 7, end) * Math.PI) : 0;
  const tilt = mix(-0.6, 0.8, Math.sin(p * Math.PI));

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: 26,
        height: 30,
        pointerEvents: 'none',
        transform: `translate(-2px, -2px) rotate(${tilt}deg) scale(${1 - clickAmount * 0.055})`,
        transformOrigin: '2px 2px',
        zIndex: 30,
      }}
    >
      {clickAmount > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: 2,
            top: 2,
            width: 18,
            height: 18,
            border: '1.25px solid rgb(255 255 255 / 0.68)',
            borderRadius: 999,
            opacity: clickAmount * 0.24,
            transform: `translate(-50%, -50%) scale(${mix(0.55, 1.72, clickAmount)})`,
          }}
        />
      ) : null}
      <svg
        aria-hidden="true"
        focusable="false"
        height="30"
        viewBox="0 0 26 30"
        width="26"
        style={{
          display: 'block',
          filter: 'drop-shadow(0 5px 8px rgb(0 0 0 / 0.62)) drop-shadow(0 1px 1px rgb(0 0 0 / 0.72))',
        }}
      >
        <path
          d="M3.55 3.2 3.4 23.8l5.82-5.35 3.92 8.45 3.2-1.48-3.88-8.35 7.72-.22L3.55 3.2Z"
          fill="rgb(255 255 255)"
          stroke="rgb(13 13 13)"
          strokeLinejoin="round"
          strokeWidth="1.55"
        />
      </svg>
    </div>
  );
}

function cursorPoint(from: [number, number], to: [number, number], progress: number) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const distance = Math.hypot(dx, dy);
  const bend = Math.min(5.2, Math.max(1.5, distance * 0.1));
  const length = Math.max(distance, 0.0001);
  const side = dx + dy >= 0 ? 1 : -1;
  const controlA: [number, number] = [
    mix(from[0], to[0], 0.34) + (-dy / length) * bend * side,
    mix(from[1], to[1], 0.32) + (dx / length) * bend * side,
  ];
  const controlB: [number, number] = [
    mix(from[0], to[0], 0.76) + (-dy / length) * bend * side,
    mix(from[1], to[1], 0.72) + (dx / length) * bend * side,
  ];
  const inv = 1 - progress;

  return [
    inv ** 3 * from[0] + 3 * inv ** 2 * progress * controlA[0] + 3 * inv * progress ** 2 * controlB[0] + progress ** 3 * to[0],
    inv ** 3 * from[1] + 3 * inv ** 2 * progress * controlA[1] + 3 * inv * progress ** 2 * controlB[1] + progress ** 3 * to[1],
  ] as [number, number];
}
