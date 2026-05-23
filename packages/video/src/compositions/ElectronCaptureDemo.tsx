import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {z} from 'zod';

export const electronCaptureDemoSchema = z.object({
  scenes: z.array(z.object({
    id: z.string(),
    caption: z.string(),
    src: z.string(),
    highlight: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  })),
});

type ElectronCaptureDemoProps = z.infer<typeof electronCaptureDemoSchema>;

const sceneFrames = 120;

export const ElectronCaptureDemo = ({scenes}: ElectronCaptureDemoProps) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const sceneIndex = Math.min(scenes.length - 1, Math.floor(frame / sceneFrames));
  const scene = scenes[sceneIndex];
  const localFrame = frame - sceneIndex * sceneFrames;
  const enter = spring({frame: localFrame, fps, config: {damping: 22, stiffness: 120}});
  const captionOpacity = interpolate(localFrame, [8, 24, 100, 116], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const imageOpacity = interpolate(localFrame, [0, 16, 108, 119], [0, 1, 1, 0.4], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const zoom = interpolate(localFrame, [0, sceneFrames - 1], [1, 1.035], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: '#0b0f12',
        color: '#f7fbff',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          opacity: imageOpacity,
          transform: `scale(${zoom})`,
          transformOrigin: `${scene.highlight.x + scene.highlight.width / 2}px ${scene.highlight.y + scene.highlight.height / 2}px`,
        }}
      >
        <Img
          src={scene.src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      </AbsoluteFill>

      <div
        style={{
          position: 'absolute',
          left: scene.highlight.x,
          top: scene.highlight.y,
          width: scene.highlight.width,
          height: scene.highlight.height,
          border: '3px solid rgba(20, 184, 166, 0.95)',
          boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.28), 0 0 34px rgba(20, 184, 166, 0.36)',
          opacity: interpolate(localFrame, [20, 36, 92, 110], [0, 1, 1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          transform: `scale(${interpolate(enter, [0, 1], [0.98, 1])})`,
          transformOrigin: 'center',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 52,
          right: 52,
          bottom: 42,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 32,
          opacity: captionOpacity,
        }}
      >
        <div
          style={{
            maxWidth: 910,
            background: 'rgba(9, 13, 16, 0.84)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            padding: '22px 26px',
            fontSize: 31,
            lineHeight: 1.2,
          }}
        >
          {scene.caption}
        </div>
        <div
          style={{
            color: 'rgba(247, 251, 255, 0.7)',
            fontSize: 24,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {sceneIndex + 1} / {scenes.length}
        </div>
      </div>
    </AbsoluteFill>
  );
};
