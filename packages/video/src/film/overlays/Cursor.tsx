import {ease, mix} from '../state/timeline';
import {getCursorAsset} from '../assets/cursors/cursorRegistry';
import type {CursorAssetId, CursorThemeId} from '../assets/cursors/cursorRegistry';

type CursorProps = {
  click?: boolean;
  cursor?: CursorAssetId;
  end: number;
  frame: number;
  from: [number, number];
  scale?: number;
  start: number;
  theme?: CursorThemeId;
  to: [number, number];
};

export function Cursor({click = true, cursor, end, frame, from, scale = 1, start, theme, to}: CursorProps) {
  const asset = getCursorAsset({cursor, theme});
  const p = ease(frame, start, end);
  const [x, y] = cursorPoint(from, to, p);
  const clickAmount = click ? Math.sin(ease(frame, end - 7, end) * Math.PI) : 0;
  const tilt = mix(-0.6, 0.8, Math.sin(p * Math.PI));
  const width = 42 * scale;
  const height = width * (asset.height / asset.width);
  const hotspotX = (asset.hotspot[0] / asset.width) * width;
  const hotspotY = (asset.hotspot[1] / asset.height) * height;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width,
        height,
        pointerEvents: 'none',
        transform: `translate(${-hotspotX}px, ${-hotspotY}px) rotate(${tilt}deg) scale(${1 - clickAmount * 0.055})`,
        transformOrigin: `${hotspotX}px ${hotspotY}px`,
        zIndex: 30,
      }}
    >
      {clickAmount > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: hotspotX,
            top: hotspotY,
            width: 18,
            height: 18,
            border: '1.25px solid rgb(255 255 255 / 0.68)',
            borderRadius: 999,
            opacity: clickAmount * 0.24,
            transform: `translate(-50%, -50%) scale(${mix(0.55, 1.72, clickAmount)})`,
          }}
        />
      ) : null}
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundImage: `url("${asset.file}")`,
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: 'contain',
          filter: 'drop-shadow(0 5px 8px rgb(0 0 0 / 0.62)) drop-shadow(0 1px 1px rgb(0 0 0 / 0.72))',
        }}
      />
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
