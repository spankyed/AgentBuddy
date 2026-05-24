import {Composition} from 'remotion';
import {AgentBuddyFilm, AgentBuddyFilmSquare} from './compositions/AgentBuddyFilm';
import {
  BoardSurfaceDemo,
  ChatSurfaceDemo,
  CodeSurfaceDemo,
  MontageSurfaceDemo,
  NotesSurfaceDemo,
  WorkflowSurfaceDemo,
} from './compositions/SurfaceDemos';

const fps = 30;
const fullDuration = 2280;
const demoDuration = 240;

export const RemotionRoot = () => {
  return (
    <>
      <Composition id="AgentBuddyFilm" component={AgentBuddyFilm} durationInFrames={fullDuration} fps={fps} width={1440} height={900} />
      <Composition id="AgentBuddyFilmSquare" component={AgentBuddyFilmSquare} durationInFrames={fullDuration} fps={fps} width={1080} height={1080} />
      <Composition id="NotesSurfaceDemo" component={NotesSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ChatSurfaceDemo" component={ChatSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="BoardSurfaceDemo" component={BoardSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="CodeSurfaceDemo" component={CodeSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="WorkflowSurfaceDemo" component={WorkflowSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="MontageSurfaceDemo" component={MontageSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
    </>
  );
};
