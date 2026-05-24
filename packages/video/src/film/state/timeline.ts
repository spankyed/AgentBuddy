export type ShotId = 'notes' | 'chat' | 'board' | 'code' | 'workflow' | 'final';

export type FilmShot = {
  duration: number;
  id: ShotId;
  title?: string;
};

export const shots: FilmShot[] = [
  {id: 'notes', title: 'Memory stays connected.', duration: 270},
  {id: 'chat', title: 'Conversation becomes work.', duration: 330},
  {id: 'board', title: 'Threads become execution.', duration: 240},
  {id: 'code', title: 'Ship from the same surface.', duration: 270},
  {id: 'workflow', title: 'Automate the system around you.', duration: 330},
  {id: 'final', duration: 300},
];

export const totalFrames = shots.reduce((sum, shot) => sum + shot.duration, 0);

export function ease(local: number, from: number, to: number) {
  if (local <= from) return 0;
  if (local >= to) return 1;
  const t = (local - from) / (to - from);
  return 1 - Math.pow(1 - t, 3);
}

export function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress;
}

export function textReveal(text: string, local: number, from: number, to: number) {
  return text.slice(0, Math.floor(mix(0, text.length, ease(local, from, to))));
}
