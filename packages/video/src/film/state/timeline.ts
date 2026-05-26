export type ChapterShotId = 'intro-title' | 'chat-title' | 'notes-title' | 'code-title' | 'workflow-title' | 'montage-title';
export type ContentShotId = 'chat' | 'board' | 'notes' | 'code' | 'workflow' | 'montage' | 'final';
export type ShotId = ChapterShotId | ContentShotId;

export type FilmShot = {
  captionAlign?: 'left' | 'right';
  chapter?: {
    eyebrow?: string;
    subtitle?: string;
    title: string;
  };
  duration: number;
  id: ShotId;
  title?: string;
};

export type FilmCaptionView = {
  alignRight: boolean;
  opacity: number;
  title: string;
  y: number;
};

export const shots: FilmShot[] = [
  {id: 'intro-title', chapter: {eyebrow: '0', title: 'AgentBuddy is...'}, duration: 78},
  {id: 'chat-title', chapter: {eyebrow: '1', title: 'More than just an AI chat'}, duration: 84},
  {id: 'chat', duration: 360},
  {id: 'board', duration: 240},
  {id: 'notes-title', chapter: {eyebrow: '2', title: 'More than just a note taker'}, duration: 84},
  {id: 'notes', duration: 330},
  {id: 'code-title', chapter: {eyebrow: '3', title: 'More than just an IDE'}, duration: 84},
  {id: 'code', duration: 420},
  {id: 'workflow-title', chapter: {eyebrow: '4', title: 'More than just a workflow engine'}, duration: 84},
  {id: 'workflow', duration: 360},
  {id: 'montage-title', chapter: {eyebrow: '5', title: 'AgentBuddy is a revolution', subtitle: 'to put the full power of AI into the hands of the people'}, duration: 108},
  {id: 'montage', duration: 360},
  {id: 'final', duration: 180},
];

export const totalFrames = shots.reduce((sum, shot) => sum + shot.duration, 0);

export function filmProgressForFrame(frame: number) {
  return frame / Math.max(1, totalFrames - 1);
}

export function shotAtFrame(frame: number) {
  let cursor = 0;
  for (const shot of shots) {
    const end = cursor + shot.duration;
    if (frame >= cursor && frame < end) return shot;
    cursor = end;
  }
  return shots[shots.length - 1];
}

export function captionViewForFrame(shot: FilmShot, frame: number): FilmCaptionView | null {
  if (!shot.title) return null;
  return {
    alignRight: shot.captionAlign === 'right',
    opacity: Math.min(
      linearClamp(frame, 10, 34, 0, 1),
      linearClamp(frame, shot.duration - 46, shot.duration - 12, 1, 0),
    ),
    title: shot.title,
    y: linearClamp(frame, 0, 34, 20, 0),
  };
}

function linearClamp(local: number, from: number, to: number, outFrom: number, outTo: number) {
  if (local <= from) return outFrom;
  if (local >= to) return outTo;
  return mix(outFrom, outTo, (local - from) / (to - from));
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

export function textReveal(text: string, local: number, from: number, to: number) {
  return text.slice(0, Math.floor(mix(0, text.length, ease(local, from, to))));
}
