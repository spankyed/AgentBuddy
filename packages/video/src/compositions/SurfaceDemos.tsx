import {useCurrentFrame} from 'remotion';
import {
  BoardSurface,
  ChatSurface,
  CodeSurface,
  MontageSurface,
  NotesSurface,
  SurfaceFrame,
  WorkflowSurface,
} from '../ui/surfaces';

export const NotesSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return <SurfaceFrame><NotesSurface frame={frame} /></SurfaceFrame>;
};

export const ChatSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return <SurfaceFrame><ChatSurface frame={frame} /></SurfaceFrame>;
};

export const BoardSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return <SurfaceFrame><BoardSurface frame={frame} /></SurfaceFrame>;
};

export const CodeSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return <SurfaceFrame><CodeSurface frame={frame} /></SurfaceFrame>;
};

export const WorkflowSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return <SurfaceFrame><WorkflowSurface frame={frame} /></SurfaceFrame>;
};

export const MontageSurfaceDemo = () => {
  const frame = useCurrentFrame();
  return <SurfaceFrame><MontageSurface frame={frame} /></SurfaceFrame>;
};
