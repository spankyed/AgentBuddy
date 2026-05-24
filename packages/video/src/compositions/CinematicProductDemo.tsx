import {
  AbsoluteFill,
  Easing,
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

const captureSchema = z.object({
  id: z.string(),
  electronScene: z.string(),
  src: z.string(),
  captureMetadata: z.object({
    viewport: z.object({
      width: z.number(),
      height: z.number(),
      devicePixelRatio: z.number(),
    }),
    targets: z.record(rectSchema),
  }),
});

const momentSchema = z.object({
  id: z.string(),
  chapter: z.string(),
  durationInFrames: z.number(),
  captures: z.array(captureSchema),
  motion: z.object({
    type: z.enum(['stream', 'type', 'switch', 'drag', 'montage', 'terminal', 'graph', 'final']),
    cameraTargetId: z.string().optional(),
    cursorPath: z.array(z.object({x: z.number(), y: z.number(), frame: z.number()})).optional(),
  }),
  copy: z.object({
    kicker: z.string().optional(),
    headline: z.string().optional(),
    subline: z.string().optional(),
  }).optional(),
});

export const cinematicProductDemoSchema = z.object({
  moments: z.array(momentSchema),
  scenes: z.array(captureSchema).optional(),
});

type Capture = z.infer<typeof captureSchema>;
type DemoMoment = z.infer<typeof momentSchema>;
type CinematicProductDemoProps = z.infer<typeof cinematicProductDemoSchema>;
type Rect = z.infer<typeof rectSchema>;

const uiFont = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

function ease(frame: number, input: [number, number], output: [number, number]) {
  return interpolate(frame, input, output, {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
}

function cumulativeStart(moments: DemoMoment[], index: number) {
  return moments.slice(0, index).reduce((sum, moment) => sum + moment.durationInFrames, 0);
}

function currentMoment(moments: DemoMoment[], frame: number) {
  let elapsed = 0;
  for (let index = 0; index < moments.length; index += 1) {
    const moment = moments[index];
    if (frame < elapsed + moment.durationInFrames) {
      return {moment, index, localFrame: frame - elapsed};
    }
    elapsed += moment.durationInFrames;
  }

  const index = moments.length - 1;
  return {moment: moments[index], index, localFrame: Math.max(moments[index].durationInFrames - 1, 0)};
}

function rectFor(capture: Capture, targetId?: string): Rect {
  const targets = capture.captureMetadata.targets;
  return (
    (targetId ? targets[targetId] : undefined)
    ?? targets['canvas-area']
    ?? targets['chat-area']
    ?? {
      x: 0,
      y: 0,
      width: capture.captureMetadata.viewport.width,
      height: capture.captureMetadata.viewport.height,
    }
  );
}

function targetCenter(capture: Capture, targetId?: string) {
  const rect = rectFor(capture, targetId);
  return {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
}

function useAppFrame() {
  const {width, height} = useVideoConfig();
  const margin = width === height ? 58 : 42;
  const maxWidth = width - margin * 2;
  const maxHeight = height - margin * 2;
  const appAspect = 1440 / 900;
  const frameWidth = Math.min(maxWidth, maxHeight * appAspect);
  const frameHeight = frameWidth / appAspect;
  return {
    x: (width - frameWidth) / 2,
    y: width === height ? 76 : (height - frameHeight) / 2,
    width: frameWidth,
    height: frameHeight,
  };
}

function mapPoint(capture: Capture, x: number, y: number, appFrame: ReturnType<typeof useAppFrame>) {
  const viewport = capture.captureMetadata.viewport;
  return {
    x: appFrame.x + (x / viewport.width) * appFrame.width,
    y: appFrame.y + (y / viewport.height) * appFrame.height,
  };
}

function pointForTarget(capture: Capture, appFrame: ReturnType<typeof useAppFrame>, targetId?: string) {
  const point = targetCenter(capture, targetId);
  return mapPoint(capture, point.x, point.y, appFrame);
}

function CapturedFrame({
  capture,
  opacity = 1,
  targetId,
  zoom = 1,
  x = 0,
  y = 0,
  blur = 0,
  dim = 0,
}: {
  key?: string;
  capture: Capture;
  opacity?: number;
  targetId?: string;
  zoom?: number;
  x?: number;
  y?: number;
  blur?: number;
  dim?: number;
}) {
  const appFrame = useAppFrame();
  const center = targetCenter(capture, targetId);
  const originX = (center.x / capture.captureMetadata.viewport.width) * appFrame.width;
  const originY = (center.y / capture.captureMetadata.viewport.height) * appFrame.height;

  return (
    <div
      style={{
        position: 'absolute',
        left: appFrame.x,
        top: appFrame.y,
        width: appFrame.width,
        height: appFrame.height,
        opacity,
        overflow: 'hidden',
        background: '#0b0d10',
        border: '1px solid rgba(255,255,255,0.11)',
        boxShadow: '0 48px 140px rgba(0,0,0,0.48)',
        transform: `translate(${x}px, ${y}px)`,
      }}
    >
      <Img
        src={capture.src}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: `scale(${zoom})`,
          transformOrigin: `${originX}px ${originY}px`,
          filter: `saturate(1.08) contrast(1.03) blur(${blur}px) brightness(${1 - dim})`,
        }}
      />
    </div>
  );
}

function Caption({moment, localFrame}: {moment: DemoMoment; localFrame: number}) {
  if (!moment.copy?.headline && !moment.copy?.subline) return null;
  const {width} = useVideoConfig();
  const isSquare = width === useVideoConfig().height;
  const opacity = interpolate(localFrame, [8, 26, moment.durationInFrames - 36, moment.durationInFrames - 12], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: isSquare ? 64 : 78,
        right: isSquare ? 64 : 78,
        bottom: isSquare ? 70 : 62,
        opacity,
        transform: `translateY(${ease(localFrame, [0, 32], [18, 0])}px)`,
      }}
    >
      <div style={{fontSize: 13, color: 'rgba(245,250,255,0.54)', textTransform: 'uppercase', marginBottom: 10}}>
        {moment.chapter}
      </div>
      <div
        style={{
          fontSize: isSquare ? 45 : 58,
          lineHeight: 0.98,
          fontWeight: 780,
          letterSpacing: 0,
          textShadow: '0 18px 70px rgba(0,0,0,0.68)',
        }}
      >
        {moment.copy?.headline}
      </div>
      {moment.copy?.subline ? (
        <div style={{marginTop: 16, maxWidth: 760, fontSize: isSquare ? 24 : 27, lineHeight: 1.18, color: 'rgba(245,250,255,0.72)'}}>
          {moment.copy.subline}
        </div>
      ) : null}
    </div>
  );
}

function Cursor({
  capture,
  localFrame,
  points,
  clickFrames = [],
}: {
  capture: Capture;
  localFrame: number;
  points: Array<{targetId?: string; x?: number; y?: number; frame: number}>;
  clickFrames?: number[];
}) {
  const appFrame = useAppFrame();
  if (points.length < 2) return null;
  let from = points[0];
  let to = points[points.length - 1];
  for (let index = 0; index < points.length - 1; index += 1) {
    if (localFrame >= points[index].frame && localFrame <= points[index + 1].frame) {
      from = points[index];
      to = points[index + 1];
      break;
    }
  }
  const progress = ease(localFrame, [from.frame, to.frame], [0, 1]);
  const fromPoint = from.targetId ? pointForTarget(capture, appFrame, from.targetId) : mapPoint(capture, from.x ?? 0, from.y ?? 0, appFrame);
  const toPoint = to.targetId ? pointForTarget(capture, appFrame, to.targetId) : mapPoint(capture, to.x ?? 0, to.y ?? 0, appFrame);
  const curve = Math.sin(progress * Math.PI) * 24;
  const overshoot = progress > 0.82 ? Math.sin((progress - 0.82) / 0.18 * Math.PI) * 7 : 0;
  const x = mix(fromPoint.x, toPoint.x, progress) + curve + overshoot;
  const y = mix(fromPoint.y, toPoint.y, progress) - curve * 0.35;
  const pulse = Math.max(...clickFrames.map(click => interpolate(Math.abs(localFrame - click), [0, 12], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })), 0);

  return (
    <>
      {pulse > 0 ? (
        <div
          style={{
            position: 'absolute',
            left: x - 20,
            top: y - 20,
            width: 40,
            height: 40,
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.42)',
            opacity: pulse * 0.7,
            transform: `scale(${1.2 + (1 - pulse) * 1.5})`,
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: 18,
          height: 24,
          opacity: interpolate(localFrame, [0, 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.55))',
        }}
      >
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: '7px solid #f7fbff',
            borderTop: '0 solid transparent',
            borderBottom: '18px solid transparent',
            transform: 'skew(-12deg)',
          }}
        />
      </div>
    </>
  );
}

function CaptureCuts({moment, localFrame, targetId}: {moment: DemoMoment; localFrame: number; targetId?: string}) {
  const count = moment.captures.length;
  return (
    <>
      {moment.captures.map((capture, index) => {
        const start = (index / count) * moment.durationInFrames;
        const end = ((index + 1) / count) * moment.durationInFrames;
        const opacity = Math.min(
          ease(localFrame, [start - 8, start + 8], [0, 1]),
          ease(localFrame, [end - 10, end + 8], [1, index === count - 1 ? 1 : 0]),
        );
        const zoom = interpolate(localFrame, [start, end], [1.018, 1.05], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        return <CapturedFrame key={capture.id} capture={capture} opacity={opacity} targetId={targetId} zoom={zoom} />;
      })}
    </>
  );
}

function TypeOverlay({capture, localFrame, text, from, to}: {capture: Capture; localFrame: number; text: string; from: number; to: number}) {
  const appFrame = useAppFrame();
  const input = rectFor(capture, 'agent-chat-input');
  const topLeft = mapPoint(capture, input.x + 18, input.y + input.height * 0.3, appFrame);
  const visible = text.slice(0, Math.floor(ease(localFrame, [from, to], [0, text.length])));
  const opacity = interpolate(localFrame, [from - 8, from + 4, to + 28, to + 52], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div style={{position: 'absolute', left: topLeft.x, top: topLeft.y, opacity, color: '#e8f1f8', fontSize: 16, fontWeight: 520}}>
      {visible}
      <span style={{opacity: Math.sin(localFrame * 0.55) > 0 ? 1 : 0.2}}>_</span>
    </div>
  );
}

function StreamOverlay({localFrame}: {localFrame: number}) {
  const appFrame = useAppFrame();
  const lines = [
    'Creating tickets from launch context',
    'Linking memory note to the thread',
    'Generating commit and PR plan',
    'Scheduling release workflow',
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: appFrame.x + appFrame.width * 0.58,
        top: appFrame.y + appFrame.height * 0.24,
        width: appFrame.width * 0.31,
        padding: '16px 18px',
        background: 'rgba(12,15,18,0.72)',
        border: '1px solid rgba(255,255,255,0.1)',
        backdropFilter: 'blur(12px)',
        opacity: interpolate(localFrame, [95, 116, 218, 242], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
      }}
    >
      {lines.map((line, index) => {
        const reveal = ease(localFrame, [112 + index * 18, 132 + index * 18], [0, 1]);
        return (
          <div key={line} style={{display: 'flex', alignItems: 'center', gap: 10, margin: '9px 0', opacity: reveal}}>
            <div style={{width: 8, height: 8, borderRadius: 999, background: index < 3 ? '#2dd4bf' : '#8bdbff'}} />
            <div style={{fontSize: 14, color: 'rgba(241,247,255,0.86)'}}>{line}</div>
          </div>
        );
      })}
    </div>
  );
}

function ChatStreamShot({moment, localFrame}: {moment: DemoMoment; localFrame: number}) {
  const active = moment.captures[Math.min(Math.floor(localFrame / 55), moment.captures.length - 1)];
  return (
    <>
      <CaptureCuts moment={moment} localFrame={localFrame} targetId="chat-area" />
      <TypeOverlay capture={moment.captures[0]} localFrame={localFrame} from={22} to={72} text="Turn this launch brief into tickets, notes, and a PR plan" />
      <StreamOverlay localFrame={localFrame} />
      <Cursor
        capture={active}
        localFrame={localFrame}
        points={[
          {targetId: 'agent-chat-input', frame: 8},
          {targetId: 'chat-area', frame: 86},
          {targetId: 'agent-artifacts', frame: 184},
        ]}
        clickFrames={[78, 180]}
      />
      <Caption moment={moment} localFrame={localFrame} />
    </>
  );
}

function SwitchShot({moment, localFrame}: {moment: DemoMoment; localFrame: number}) {
  return (
    <>
      <CaptureCuts moment={moment} localFrame={localFrame} targetId={moment.motion.cameraTargetId} />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 220,
          height: 2,
          marginLeft: -110,
          background: 'linear-gradient(90deg, transparent, rgba(45,212,191,0.9), transparent)',
          opacity: interpolate(Math.sin(localFrame * 0.2), [-1, 1], [0.12, 0.45]),
          transform: `translateY(${interpolate(localFrame, [0, moment.durationInFrames], [80, -80])}px)`,
        }}
      />
      <Cursor
        capture={moment.captures[0]}
        localFrame={localFrame}
        points={[
          {targetId: 'agent-chat-input', frame: 10},
          {targetId: moment.motion.cameraTargetId ?? 'canvas-area', frame: 62},
          {targetId: 'canvas-area', frame: 132},
        ]}
        clickFrames={[58, 130]}
      />
      <Caption moment={moment} localFrame={localFrame} />
    </>
  );
}


function CodeShipShot({moment, localFrame}: {moment: DemoMoment; localFrame: number}) {
  const appFrame = useAppFrame();
  const commitReveal = ease(localFrame, [104, 148], [0, 1]);
  const prReveal = ease(localFrame, [156, 206], [0, 1]);
  const files = ['packages/video/src/demo/product-intro.ts', 'CinematicProductDemo.tsx', 'render-demo.ts'];
  const diffLines = [
    ['+', 'moments: cinematicProductDemoMoments,'],
    ['+', 'captures: captures("code_changes", "commit_message_generated")'],
    ['-', 'scene -> one static screenshot'],
    ['+', 'moment -> captured states + authored motion'],
  ];

  return (
    <>
      <CaptureCuts moment={moment} localFrame={localFrame} targetId="canvas-area" />
      <div
        style={{
          position: 'absolute',
          left: appFrame.x + appFrame.width * 0.11,
          top: appFrame.y + appFrame.height * 0.14,
          width: appFrame.width * 0.78,
          height: appFrame.height * 0.62,
          display: 'grid',
          gridTemplateColumns: '260px 1fr',
          background: 'rgba(9,12,16,0.9)',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 30px 100px rgba(0,0,0,0.5)',
          opacity: interpolate(localFrame, [18, 36, moment.durationInFrames - 34, moment.durationInFrames - 12], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        }}
      >
        <div style={{borderRight: '1px solid rgba(255,255,255,0.08)', padding: 18}}>
          <div style={{fontSize: 12, color: 'rgba(245,250,255,0.44)', marginBottom: 14}}>CHANGED FILES</div>
          {files.map((file, index) => (
            <div
              key={file}
              style={{
                padding: '9px 10px',
                marginBottom: 7,
                background: index === 1 ? 'rgba(45,212,191,0.13)' : 'rgba(255,255,255,0.04)',
                color: index === 1 ? '#d8fff8' : 'rgba(239,246,255,0.76)',
                fontSize: 13,
                opacity: ease(localFrame, [28 + index * 13, 42 + index * 13], [0, 1]),
              }}
            >
              {file}
            </div>
          ))}
        </div>
        <div style={{padding: 22, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 14}}>
          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 18, color: 'rgba(245,250,255,0.56)'}}>
            <span>CinematicProductDemo.tsx</span>
            <span>{Math.round(ease(localFrame, [38, 92], [0, 4]))} files changed</span>
          </div>
          {diffLines.map(([kind, line], index) => (
            <div
              key={line}
              style={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr',
                padding: '6px 8px',
                color: kind === '+' ? '#b6f7d1' : '#f4a6a6',
                background: kind === '+' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)',
                opacity: ease(localFrame, [44 + index * 13, 58 + index * 13], [0, 1]),
              }}
            >
              <span>{kind}</span>
              <span>{line}</span>
            </div>
          ))}
          <div
            style={{
              marginTop: 24,
              padding: 16,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              opacity: commitReveal,
              transform: `translateY(${(1 - commitReveal) * 14}px)`,
              fontFamily: uiFont,
            }}
          >
            <div style={{fontSize: 12, color: 'rgba(245,250,255,0.48)', marginBottom: 8}}>GENERATED COMMIT</div>
            <div style={{fontSize: 18, color: '#f3fbff'}}>feat(video): compose launch demo from captured product moments</div>
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          right: appFrame.x + appFrame.width * 0.11,
          bottom: appFrame.y + appFrame.height * 0.12,
          display: 'flex',
          gap: 10,
          opacity: prReveal,
          transform: `translateY(${(1 - prReveal) * 18}px)`,
        }}
      >
        {['branch published', 'checks running', 'PR created'].map((item, index) => (
          <div
            key={item}
            style={{
              padding: '10px 13px',
              background: index === 2 ? 'rgba(45,212,191,0.18)' : 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
              color: '#eff8ff',
              fontSize: 13,
            }}
          >
            {item}
          </div>
        ))}
      </div>
      <Cursor
        capture={moment.captures[0]}
        localFrame={localFrame}
        points={[
          {x: 380, y: 230, frame: 18},
          {x: 780, y: 300, frame: 76},
          {x: 1060, y: 720, frame: 164},
        ]}
        clickFrames={[72, 166]}
      />
      <Caption moment={moment} localFrame={localFrame} />
    </>
  );
}

function DragShot({moment, localFrame}: {moment: DemoMoment; localFrame: number}) {
  const before = moment.captures[0];
  const after = moment.captures[1] ?? before;
  const progress = ease(localFrame, [42, moment.durationInFrames - 50], [0, 1]);
  return (
    <>
      <CapturedFrame capture={before} targetId="canvas-area" opacity={1 - ease(localFrame, [82, 118], [0, 1]) * 0.55} zoom={1.025} />
      <CapturedFrame capture={after} targetId="canvas-area" opacity={ease(localFrame, [96, 126], [0, 1])} zoom={1.035} />
      <div
        style={{
          position: 'absolute',
          left: `${mix(28, 62, progress)}%`,
          top: `${mix(45, 32, progress)}%`,
          width: 270,
          padding: '13px 15px',
          background: 'rgba(22,28,34,0.96)',
          border: '1px solid rgba(45,212,191,0.45)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.45)',
          color: '#eff6ff',
          fontSize: 15,
          opacity: interpolate(localFrame, [25, 50, moment.durationInFrames - 36, moment.durationInFrames - 18], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          transform: `rotate(${mix(-1.5, 0.8, progress)}deg)`,
        }}
      >
        Publish launch film cutdown
        <div style={{marginTop: 7, color: 'rgba(239,246,255,0.52)', fontSize: 12}}>Moved to active work</div>
      </div>
      <Cursor
        capture={before}
        localFrame={localFrame}
        points={[
          {x: 430, y: 545, frame: 18},
          {x: 600, y: 500, frame: 56},
          {x: 930, y: 365, frame: 122},
        ]}
        clickFrames={[52, 126]}
      />
    </>
  );
}

function NoteEditShot({moment, localFrame}: {moment: DemoMoment; localFrame: number}) {
  return (
    <>
      <CaptureCuts moment={moment} localFrame={localFrame} targetId="canvas-area" />
      <div
        style={{
          position: 'absolute',
          left: '12%',
          top: '25%',
          width: 410,
          color: '#eef6ff',
          fontSize: 22,
          lineHeight: 1.38,
          opacity: interpolate(localFrame, [55, 72, 142, 166], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        }}
      >
        {'AgentBuddy replaces chat, notes, tasks, code, and automation handoffs.'.slice(0, Math.floor(ease(localFrame, [62, 136], [0, 76])))}
        <span style={{opacity: Math.sin(localFrame * 0.7) > 0 ? 1 : 0.2}}>_</span>
      </div>
      <Cursor
        capture={moment.captures[0]}
        localFrame={localFrame}
        points={[
          {targetId: 'canvas-area', frame: 16},
          {x: 370, y: 300, frame: 54},
          {targetId: 'agent-artifacts', frame: 162},
        ]}
        clickFrames={[52, 160]}
      />
      <Caption moment={moment} localFrame={localFrame} />
    </>
  );
}

function TerminalShot({moment, localFrame}: {moment: DemoMoment; localFrame: number}) {
  const appFrame = useAppFrame();
  const lines = [
    '$ npm run video:capture -- cinematic-product-demo workflow_execution',
    '[DEMO] Captured deterministic Electron state',
    '$ npm run video:render -- cinematic-product-demo',
    'Rendered landscape and square launch cuts',
  ];
  return (
    <>
      <CaptureCuts moment={moment} localFrame={localFrame} targetId="canvas-area" />
      <div
        style={{
          position: 'absolute',
          left: appFrame.x + appFrame.width * 0.1,
          bottom: appFrame.y + appFrame.height * 0.08,
          width: appFrame.width * 0.62,
          padding: '18px 20px',
          background: 'rgba(5,8,12,0.82)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#d7fbe8',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 15,
          lineHeight: 1.55,
          opacity: interpolate(localFrame, [8, 18, moment.durationInFrames - 22, moment.durationInFrames - 8], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        }}
      >
        {lines.map((line, index) => (
          <div key={line} style={{opacity: ease(localFrame, [10 + index * 20, 22 + index * 20], [0, 1])}}>
            {line}
          </div>
        ))}
      </div>
    </>
  );
}

function GraphShot({moment, localFrame}: {moment: DemoMoment; localFrame: number}) {
  const appFrame = useAppFrame();
  const nodes = [
    {x: 0.28, y: 0.34, label: 'Command'},
    {x: 0.46, y: 0.48, label: 'Context'},
    {x: 0.63, y: 0.34, label: 'Actions'},
    {x: 0.73, y: 0.57, label: 'Release'},
  ];
  return (
    <>
      <CaptureCuts moment={moment} localFrame={localFrame} targetId={moment.motion.cameraTargetId} />
      <svg
        width={appFrame.width}
        height={appFrame.height}
        viewBox={`0 0 ${appFrame.width} ${appFrame.height}`}
        style={{position: 'absolute', left: appFrame.x, top: appFrame.y, opacity: 0.8}}
      >
        {nodes.slice(0, -1).map((node, index) => {
          const next = nodes[index + 1];
          const reveal = ease(localFrame, [58 + index * 26, 82 + index * 26], [0, 1]);
          return (
            <line
              key={node.label}
              x1={node.x * appFrame.width}
              y1={node.y * appFrame.height}
              x2={mix(node.x, next.x, reveal) * appFrame.width}
              y2={mix(node.y, next.y, reveal) * appFrame.height}
              stroke="rgba(45,212,191,0.55)"
              strokeWidth="2"
            />
          );
        })}
      </svg>
      {nodes.map((node, index) => (
        <div
          key={node.label}
          style={{
            position: 'absolute',
            left: appFrame.x + node.x * appFrame.width - 48,
            top: appFrame.y + node.y * appFrame.height - 18,
            width: 96,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: index === 3 ? 'rgba(45,212,191,0.2)' : 'rgba(12,18,22,0.86)',
            border: '1px solid rgba(45,212,191,0.42)',
            color: '#eafffb',
            fontSize: 13,
            opacity: interpolate(localFrame, [42 + index * 24, 60 + index * 24, 182, 212], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
            boxShadow: '0 0 34px rgba(45,212,191,0.78)',
            transform: `scale(${spring({frame: localFrame - 42 - index * 24, fps: 30, config: {damping: 18, stiffness: 120}})})`,
          }}
        >
          {node.label}
        </div>
      ))}
      <Caption moment={moment} localFrame={localFrame} />
    </>
  );
}

function MontageShot({moment, localFrame}: {moment: DemoMoment; localFrame: number}) {
  const cut = Math.floor(localFrame / Math.max(28, moment.durationInFrames / moment.captures.length));
  const labels = ['Memory graph updated', 'Logs streaming', 'Knowledge query returned', 'Personal defaults synced', 'Threads dashboard', 'Workflow executed'];
  return (
    <>
      {moment.captures.map((capture, index) => {
        const start = index * (moment.durationInFrames / moment.captures.length);
        const opacity = index === clamp(cut, 0, moment.captures.length - 1)
          ? 1
          : interpolate(Math.abs(localFrame - start), [0, 14], [0.5, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
        return (
          <CapturedFrame
            key={capture.id}
            capture={capture}
            opacity={opacity}
            targetId={capture.id === 'brain_graph' ? 'brain-flow-graph' : 'canvas-area'}
            zoom={1.04 + index * 0.012}
            x={(index % 2 === 0 ? -1 : 1) * ease(localFrame - start, [0, 46], [18, 0])}
          />
        );
      })}
      <div style={{position: 'absolute', inset: 0, background: `rgba(45,212,191,${interpolate(Math.sin(localFrame * 0.32), [-1, 1], [0.02, 0.08])})`}} />
      <div
        style={{
          position: 'absolute',
          left: '9%',
          bottom: '13%',
          padding: '12px 15px',
          background: 'rgba(5,8,12,0.72)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#f2fbff',
          fontSize: 18,
          opacity: interpolate(localFrame % 56, [0, 10, 44, 56], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
        }}
      >
        {labels[(cut + (moment.id === 'rapid-montage-b' ? 3 : 0)) % labels.length]}
      </div>
    </>
  );
}

function FinalShot({moment, localFrame}: {moment: DemoMoment; localFrame: number}) {
  const appFrame = useAppFrame();
  return (
    <>
      <CapturedFrame capture={moment.captures[0]} targetId="canvas-area" opacity={ease(localFrame, [0, 36], [0, 0.62])} zoom={1.04} blur={ease(localFrame, [70, 120], [0, 5])} dim={0.2} />
      <CapturedFrame capture={moment.captures[1]} targetId="flow-editor-canvas" opacity={ease(localFrame, [42, 82], [0, 0.35])} zoom={1.08} blur={3} dim={0.28} />
      <div
        style={{
          position: 'absolute',
          left: appFrame.x,
          top: appFrame.y,
          width: appFrame.width,
          height: appFrame.height,
          background: 'linear-gradient(135deg, rgba(8,12,14,0.68), rgba(8,10,12,0.25))',
          border: '1px solid rgba(255,255,255,0.11)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '48%',
          transform: `translate(-50%, -50%) scale(${ease(localFrame, [58, 108], [0.96, 1])})`,
          textAlign: 'center',
          opacity: ease(localFrame, [52, 88], [0, 1]),
        }}
      >
        <div style={{fontSize: 82, lineHeight: 0.92, fontWeight: 820, letterSpacing: 0}}>AgentBuddy</div>
        <div style={{marginTop: 22, fontSize: 29, color: 'rgba(246,251,255,0.72)'}}>The AI operating system for modern work.</div>
      </div>
    </>
  );
}

function Shot({moment, localFrame}: {moment: DemoMoment; localFrame: number}) {
  if (moment.id === 'code-ship') {
    return <CodeShipShot moment={moment} localFrame={localFrame} />;
  }
  switch (moment.motion.type) {
    case 'stream':
      return <ChatStreamShot moment={moment} localFrame={localFrame} />;
    case 'type':
      return <NoteEditShot moment={moment} localFrame={localFrame} />;
    case 'drag':
      return <DragShot moment={moment} localFrame={localFrame} />;
    case 'terminal':
      return <TerminalShot moment={moment} localFrame={localFrame} />;
    case 'graph':
      return <GraphShot moment={moment} localFrame={localFrame} />;
    case 'montage':
      return <MontageShot moment={moment} localFrame={localFrame} />;
    case 'final':
      return <FinalShot moment={moment} localFrame={localFrame} />;
    case 'switch':
    default:
      return <SwitchShot moment={moment} localFrame={localFrame} />;
  }
}

export const CinematicProductDemo = ({moments, scenes}: CinematicProductDemoProps) => {
  const frame = useCurrentFrame();
  const {width, height} = useVideoConfig();
  const fallbackMoments = scenes?.length ? [{
    id: 'fallback',
    chapter: 'AgentBuddy',
    durationInFrames: 120,
    captures: scenes,
    motion: {type: 'montage' as const, cameraTargetId: 'canvas-area'},
  }] : [];
  const resolvedMoments = moments.length ? moments : fallbackMoments;
  const {moment, index, localFrame} = currentMoment(resolvedMoments, frame);
  const totalFrames = resolvedMoments.reduce((sum, item) => sum + item.durationInFrames, 0);
  const progress = totalFrames <= 1 ? 1 : frame / (totalFrames - 1);
  const nextStart = cumulativeStart(resolvedMoments, index + 1);
  const flash = interpolate(Math.abs(frame - nextStart), [0, 12], [0.18, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill
      style={{
        background: '#05070a',
        color: '#f6fbff',
        fontFamily: uiFont,
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          background: width === height
            ? 'linear-gradient(180deg, #080b0f 0%, #05070a 55%, #0b1012 100%)'
            : 'linear-gradient(135deg, #080b0f 0%, #05070a 58%, #0b1012 100%)',
        }}
      />
      <Shot moment={moment} localFrame={localFrame} />
      <div style={{position: 'absolute', inset: 0, background: `rgba(255,255,255,${flash})`, pointerEvents: 'none'}} />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: 'rgba(255,255,255,0.1)',
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #2dd4bf, #8bdbff, #f7fbff)',
          }}
        />
      </div>
      <div style={{position: 'absolute', inset: 0, boxShadow: height === width ? 'inset 0 0 100px rgba(0,0,0,0.45)' : 'inset 0 0 120px rgba(0,0,0,0.38)'}} />
    </AbsoluteFill>
  );
};
