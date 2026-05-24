import {Composition} from 'remotion';
import {AgentBuddyFilm, AgentBuddyFilmSquare} from './film/AgentBuddyFilm';
import {
  BoardSurfaceDemo,
  ChatSurfaceDemo,
  ChatComposerDemo,
  ChatComposerWithAttachmentDemo,
  CodeSurfaceDemo,
  FlowCanvasDemo,
  FlowNodeVariantsDemo,
  FlowPaletteDemo,
  NotesSurfaceDemo,
  ToolbarDemo,
  WorkflowSurfaceDemo,
} from './compositions/ComponentDemos';

const fps = 30;
const fullDuration = 1860;
const demoDuration = 240;

export const RemotionRoot = () => {
  return (
    <>
      <Composition id="AgentBuddyFilm" component={AgentBuddyFilm} durationInFrames={fullDuration} fps={fps} width={1440} height={900} />
      <Composition id="AgentBuddyFilmSquare" component={AgentBuddyFilmSquare} durationInFrames={fullDuration} fps={fps} width={1080} height={1080} />
      <Composition id="ToolbarDemo" component={ToolbarDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ChatComposerDemo" component={ChatComposerDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ChatComposerWithAttachmentDemo" component={ChatComposerWithAttachmentDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="FlowPaletteDemo" component={FlowPaletteDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="FlowNodeVariantsDemo" component={FlowNodeVariantsDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="FlowCanvasDemo" component={FlowCanvasDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="NotesSurfaceDemo" component={NotesSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ChatSurfaceDemo" component={ChatSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="BoardSurfaceDemo" component={BoardSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="CodeSurfaceDemo" component={CodeSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="WorkflowSurfaceDemo" component={WorkflowSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
    </>
  );
};
