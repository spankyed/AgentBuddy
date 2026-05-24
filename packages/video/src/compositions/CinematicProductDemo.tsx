import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {z} from 'zod';

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const cinematicProductDemoSchema = z.object({
  scenes: z.array(z.object({
    id: z.string(),
    chapter: z.string(),
    headline: z.string(),
    subline: z.string(),
    src: z.string(),
    cameraTargetId: z.string(),
    durationInFrames: z.number(),
    intensity: z.number(),
    captureMetadata: z.object({
      viewport: z.object({
        width: z.number(),
        height: z.number(),
        devicePixelRatio: z.number(),
      }),
      targets: z.record(rectSchema),
    }),
  })),
});

type CinematicProductDemoProps = z.infer<typeof cinematicProductDemoSchema>;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cumulativeStart(scenes: CinematicProductDemoProps['scenes'], index: number) {
  return scenes.slice(0, index).reduce((sum, scene) => sum + scene.durationInFrames, 0);
}

function currentScene(scenes: CinematicProductDemoProps['scenes'], frame: number) {
  let elapsed = 0;
  for (let index = 0; index < scenes.length; index += 1) {
    const scene = scenes[index];
    if (frame < elapsed + scene.durationInFrames) {
      return {scene, index, localFrame: frame - elapsed};
    }
    elapsed += scene.durationInFrames;
  }

  const index = scenes.length - 1;
  return {
    scene: scenes[index],
    index,
    localFrame: scenes[index].durationInFrames - 1,
  };
}

function targetCenter(scene: CinematicProductDemoProps['scenes'][number]) {
  const target = scene.captureMetadata.targets[scene.cameraTargetId]
    ?? scene.captureMetadata.targets['canvas-area']
    ?? {x: 0, y: 0, width: scene.captureMetadata.viewport.width, height: scene.captureMetadata.viewport.height};

  return {
    x: target.x + target.width / 2,
    y: target.y + target.height / 2,
  };
}

export const CinematicProductDemo = ({scenes}: CinematicProductDemoProps) => {
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const {scene, index, localFrame} = currentScene(scenes, frame);
  const sceneProgress = scene.durationInFrames <= 1 ? 1 : localFrame / (scene.durationInFrames - 1);
  const entrance = spring({frame: localFrame, fps, config: {damping: 28, stiffness: 120}});
  const exitStart = Math.max(scene.durationInFrames - 18, 1);
  const sceneOpacity = interpolate(localFrame, [0, 12, exitStart, scene.durationInFrames - 1], [0, 1, 1, 0.18], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const textOpacity = interpolate(localFrame, [6, 22, scene.durationInFrames - 34, scene.durationInFrames - 10], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const center = targetCenter(scene);
  const driftX = interpolate(sceneProgress, [0, 1], [12 - scene.intensity * 18, -10 - scene.intensity * 14]);
  const driftY = interpolate(sceneProgress, [0, 1], [8 - scene.intensity * 10, -8]);
  const zoom = interpolate(sceneProgress, [0, 1], [1.045 + scene.intensity * 0.02, 1.095 + scene.intensity * 0.035]);
  const montagePulse = scene.intensity > 0.82
    ? interpolate(Math.sin(frame * 0.42), [-1, 1], [0.08, 0.22])
    : 0;
  const nextScene = scenes[clamp(index + 1, 0, scenes.length - 1)];
  const nextReveal = interpolate(localFrame, [scene.durationInFrames - 16, scene.durationInFrames - 1], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const totalFrames = scenes.reduce((sum, item) => sum + item.durationInFrames, 0);
  const totalProgress = totalFrames <= 1 ? 1 : frame / (totalFrames - 1);

  return (
    <AbsoluteFill
      style={{
        background: '#06080a',
        color: '#f6fbff',
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(135deg, rgba(9, 15, 18, 0.94), rgba(6, 8, 10, 0.72) 45%, rgba(11, 15, 18, 0.96)), radial-gradient(circle at 72% 18%, rgba(20, 184, 166, 0.18), transparent 36%)',
        }}
      />

      <div
        style={{
          position: 'absolute',
          inset: 36,
          opacity: sceneOpacity,
          overflow: 'hidden',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: `0 42px 130px rgba(0, 0, 0, ${0.42 + montagePulse})`,
          background: '#111',
          transform: `translate(${driftX}px, ${driftY}px) scale(${interpolate(entrance, [0, 1], [0.985, 1])})`,
        }}
      >
        <Img
          src={scene.src}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${zoom})`,
            transformOrigin: `${center.x}px ${center.y}px`,
            filter: `saturate(${1.02 + scene.intensity * 0.1}) contrast(${1.02 + scene.intensity * 0.05})`,
          }}
        />
      </div>

      {index < scenes.length - 1 ? (
        <div
          style={{
            position: 'absolute',
            inset: 36,
            opacity: nextReveal * 0.35,
            transform: `translateX(${interpolate(nextReveal, [0, 1], [80, 0])}px)`,
            overflow: 'hidden',
          }}
        >
          <Img
            src={nextScene.src}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'blur(12px) brightness(0.7)',
            }}
          />
        </div>
      ) : null}

      <div
        style={{
          position: 'absolute',
          left: 58,
          right: 58,
          top: 50,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          opacity: 0.78,
          fontSize: 15,
          letterSpacing: 0,
          color: 'rgba(246, 251, 255, 0.62)',
          textTransform: 'uppercase',
        }}
      >
        <span>{scene.chapter}</span>
        <span>{String(index + 1).padStart(2, '0')} / {String(scenes.length).padStart(2, '0')}</span>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 72,
          right: 72,
          bottom: 76,
          opacity: textOpacity,
          transform: `translateY(${interpolate(entrance, [0, 1], [26, 0])}px)`,
        }}
      >
        <div
          style={{
            width: 96,
            height: 3,
            background: '#14b8a6',
            marginBottom: 22,
            transform: `scaleX(${interpolate(entrance, [0, 1], [0.18, 1])})`,
            transformOrigin: 'left center',
          }}
        />
        <h1
          style={{
            margin: 0,
            maxWidth: 960,
            fontSize: index === scenes.length - 1 ? 78 : 56,
            lineHeight: 0.98,
            fontWeight: 760,
            letterSpacing: 0,
            textShadow: '0 18px 70px rgba(0, 0, 0, 0.55)',
          }}
        >
          {scene.headline}
        </h1>
        <p
          style={{
            margin: '16px 0 0',
            maxWidth: 820,
            color: 'rgba(246, 251, 255, 0.74)',
            fontSize: 24,
            lineHeight: 1.25,
            textShadow: '0 12px 44px rgba(0, 0, 0, 0.6)',
          }}
        >
          {scene.subline}
        </p>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: 'rgba(255, 255, 255, 0.12)',
        }}
      >
        <div
          style={{
            width: `${totalProgress * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #14b8a6, #8b5cf6, #f7fbff)',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
