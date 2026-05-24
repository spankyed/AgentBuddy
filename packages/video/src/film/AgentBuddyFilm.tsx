import {AbsoluteFill, interpolate, Sequence, useCurrentFrame} from 'remotion';
import {theme} from '../ui/theme';
import {shots, totalFrames, type ShotId} from './state/timeline';
import {BoardShot} from './shots/BoardShot';
import {ChatShot} from './shots/ChatShot';
import {CodeShot} from './shots/CodeShot';
import {FinalShot} from './shots/FinalShot';
import {MontageShot} from './shots/MontageShot';
import {NotesShot} from './shots/NotesShot';
import {WorkflowShot} from './shots/WorkflowShot';
import {SurfaceFrame} from './SurfaceFrame';

type Variant = 'landscape' | 'square';

export const AgentBuddyFilm = () => <Film variant="landscape" />;
export const AgentBuddyFilmSquare = () => <Film variant="square" />;

function Film({variant}: {variant: Variant}) {
  const frame = useCurrentFrame();
  let cursor = 0;
  const progress = frame / Math.max(1, totalFrames - 1);

  return (
    <AbsoluteFill style={{background: '#07090b', fontFamily: theme.font, color: theme.text, overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #07090b 0%, #0b1012 55%, #050608 100%)'}} />
      {shots.map(shot => {
        const start = cursor;
        cursor += shot.duration;
        return (
          <Sequence key={shot.id} from={start} durationInFrames={shot.duration}>
            <SurfaceFrame>
              <ShotSurface id={shot.id} variant={variant} />
              {shot.title ? <Caption title={shot.title} duration={shot.duration} variant={variant} /> : null}
            </SurfaceFrame>
          </Sequence>
        );
      })}
      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: 'rgba(255,255,255,.1)'}}>
        <div style={{height: '100%', width: `${progress * 100}%`, background: `linear-gradient(90deg, ${theme.teal}, ${theme.blue}, #fff)`}} />
      </div>
    </AbsoluteFill>
  );
}

function ShotSurface({id, variant}: {id: ShotId; variant: Variant}) {
  const frame = useCurrentFrame();
  if (id === 'notes') return <NotesShot frame={frame} variant={variant} />;
  if (id === 'chat') return <ChatShot frame={frame} variant={variant} />;
  if (id === 'board') return <BoardShot frame={frame} variant={variant} />;
  if (id === 'code') return <CodeShot frame={frame} variant={variant} />;
  if (id === 'workflow') return <WorkflowShot frame={frame} variant={variant} />;
  if (id === 'montage') return <MontageShot frame={frame} variant={variant} />;
  return <FinalShot frame={frame} variant={variant} />;
}

function Caption({title, duration, variant}: {title: string; duration: number; variant: Variant}) {
  const frame = useCurrentFrame();
  const opacity = Math.min(
    interpolate(frame, [10, 34], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
    interpolate(frame, [duration - 46, duration - 12], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
  );
  return (
    <div
      style={{
        position: 'absolute',
        left: variant === 'square' ? 56 : 58,
        bottom: variant === 'square' ? 44 : 38,
        maxWidth: variant === 'square' ? 930 : 1100,
        opacity,
        transform: `translateY(${interpolate(frame, [0, 34], [20, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}px)`,
        fontSize: variant === 'square' ? 56 : 64,
        lineHeight: 0.95,
        fontWeight: 800,
        letterSpacing: 0,
        textShadow: '0 18px 60px rgba(0,0,0,.58)',
      }}
    >
      {title}
    </div>
  );
}

