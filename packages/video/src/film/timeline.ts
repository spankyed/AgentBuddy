export type FilmVariant = 'landscape' | 'square';
export type FilmShotId = 'notes' | 'chat' | 'board' | 'code' | 'workflow' | 'montage' | 'final';

export type FilmShot = {
  id: FilmShotId;
  title?: string;
  duration: number;
};

export const fps = 30;

export const shots: FilmShot[] = [
  {id: 'notes', title: 'Memory stays connected.', duration: 270},
  {id: 'chat', title: 'Conversation becomes work.', duration: 330},
  {id: 'board', duration: 270},
  {id: 'code', title: 'Ship from the same surface.', duration: 360},
  {id: 'workflow', title: 'Automate the system around you.', duration: 330},
  {id: 'montage', duration: 420},
  {id: 'final', duration: 240},
];

export const totalFrames = shots.reduce((sum, shot) => sum + shot.duration, 0);

export function getShot(frame: number) {
  let start = 0;
  for (const shot of shots) {
    if (frame < start + shot.duration) {
      return {shot, start, local: frame - start};
    }
    start += shot.duration;
  }

  const shot = shots[shots.length - 1];
  return {shot, start: totalFrames - shot.duration, local: shot.duration - 1};
}

export function ease(local: number, from: number, to: number) {
  if (local <= from) return 0;
  if (local >= to) return 1;
  const t = (local - from) / (to - from);
  return 1 - Math.pow(1 - t, 3);
}

export function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}
