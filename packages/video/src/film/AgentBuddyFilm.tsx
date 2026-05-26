import type {CSSProperties, ReactNode} from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {makeStyles} from '../agentbuddy-ui/primitives/makeStyles';
import {theme} from '../ui/theme';
import {captionViewForFrame, ease, filmProgressForFrame, mix, shotAtFrame, shots, type FilmShot} from './state/timeline';
import {ChatShot} from './shots/ChatShot';
import {BoardShot} from './shots/BoardShot';
import {ChapterCard} from './shots/ChapterCard';
import {CodeShot} from './shots/CodeShot';
import {FinalShot} from './shots/FinalShot';
import {NotesShot} from './shots/NotesShot';
import {MontageShot} from './shots/MontageShot';
import {WorkflowShot} from './shots/WorkflowShot';
import {SurfaceFrame} from './SurfaceFrame';
import './AgentBuddyFilm.module.css';

const styles = makeStyles('AgentBuddyFilm');

type Variant = 'landscape' | 'square';

export const AgentBuddyFilm = () => <Film variant="landscape" />;
export const AgentBuddyFilmSquare = () => <Film variant="square" />;

function Film({variant}: {variant: Variant}) {
  const frame = useCurrentFrame();
  let cursor = 0;
  const progress = filmProgressForFrame(frame);
  const activeShot = shotAtFrame(frame);

  return (
    <AbsoluteFill className={styles.root} style={{
      '--film-blue': theme.blue,
      '--film-font': theme.font,
      '--film-progress': progress,
      '--film-teal': theme.teal,
      '--film-text': theme.text,
    } as CSSProperties}>
      <div className={styles.background} />
      {shots.map(shot => {
        const start = cursor;
        cursor += shot.duration;
        return (
          <Sequence key={shot.id} from={start} durationInFrames={shot.duration}>
            <ShotLayer shot={shot}>
              <SurfaceFrame>
                <ShotSurface shot={shot} variant={variant} />
                <Caption shot={shot} variant={variant} />
              </SurfaceFrame>
            </ShotLayer>
          </Sequence>
        );
      })}
      {activeShot?.id === 'final' || activeShot?.chapter ? null : (
        <div className={styles.progress}>
          <div className={styles.progressFill} />
        </div>
      )}
    </AbsoluteFill>
  );
}

function ShotLayer({children, shot}: {children: ReactNode; shot: FilmShot}) {
  const frame = useCurrentFrame();
  const enter = shot.chapter ? 1 : ease(frame, 0, 18);
  const exit = shot.chapter || shot.id === 'final' ? 0 : ease(frame, shot.duration - 4, shot.duration);
  const opacity = Math.min(enter, 1 - exit);
  const scale = shot.chapter ? 1 : mix(0.992, 1, enter) - exit * 0.006;
  const y = shot.chapter ? 0 : mix(10, 0, enter) - exit * 6;

  return (
    <div
      className={styles.shotLayer}
      style={{
        opacity,
        transform: `translateY(${y}px) scale(${scale})`,
      }}
    >
      {children}
    </div>
  );
}

function ShotSurface({shot, variant}: {shot: FilmShot; variant: Variant}) {
  const frame = useCurrentFrame();
  const id = shot.id;
  if (shot.chapter) {
    return <ChapterCard duration={shot.duration} eyebrow={shot.chapter.eyebrow} frame={frame} subtitle={shot.chapter.subtitle} title={shot.chapter.title} variant={variant} />;
  }
  if (id === 'notes') return <NotesShot frame={frame} variant={variant} />;
  if (id === 'chat') return <ChatShot frame={frame} variant={variant} />;
  if (id === 'board') return <BoardShot frame={frame} variant={variant} />;
  if (id === 'code') return <CodeShot frame={frame} variant={variant} />;
  if (id === 'workflow') return <WorkflowShot frame={frame} variant={variant} />;
  if (id === 'montage') return <MontageShot frame={frame} variant={variant} />;
  return <FinalShot frame={frame} variant={variant} />;
}

function Caption({shot, variant}: {shot: FilmShot; variant: Variant}) {
  const frame = useCurrentFrame();
  const view = captionViewForFrame(shot, frame);
  if (!view) return null;
  const className = captionClassName({alignRight: view.alignRight, variant});
  return (
    <div
      className={className}
      style={{
        '--caption-opacity': view.opacity,
        '--caption-y': `${view.y}px`,
      } as CSSProperties}
    >
      {view.title}
    </div>
  );
}

function captionClassName({alignRight, variant}: {alignRight: boolean; variant: Variant}) {
  if (variant === 'square') return alignRight ? styles.captionSquareRight : styles.captionSquare;
  return alignRight ? styles.captionRight : styles.caption;
}
