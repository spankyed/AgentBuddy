import {Composition} from 'remotion';
import {AgentBuddyFilm, AgentBuddyFilmSquare} from './film/AgentBuddyFilm';
import {
  BoardSurfaceDemo,
  CodeSurfaceDemo,
  ChatSurfaceDemo,
  ChatComposerDemo,
  ChatComposerModeMenuDemo,
  ChatComposerPhaseMenuDemo,
  ChatComposerWithAttachmentDemo,
  CodeReviewDemo,
  ContentBlocksDemo,
  FlowCanvasDemo,
  FlowNodeFormDemo,
  FlowNodeVariantsDemo,
  FlowPaletteDemo,
  InteractionControlsDemo,
  InteractionBlocksDemo,
  KanbanComponentsDemo,
  MessageBubbleDemo,
  NotesRightRailDemo,
  NotesRightRailMenuDemo,
  NotesRightRailSearchDemo,
  NotesRightRailTrashActionsDemo,
  NotesRightRailTrashDemo,
  NotesSurfaceDemo,
  PlanArtifactDemo,
  PullRequestCreateDemo,
  PullRequestDetailsDemo,
  PullRequestFilesDemo,
  PullRequestPanelDemo,
  SourceControlPanelDemo,
  TaskListPanelDemo,
  TaskListPanelMenuDemo,
  TaskListPanelRowMenuDemo,
  TerminalPanelDemo,
  ThreadsHeaderArchiveDemo,
  ThreadsHeaderDemo,
  ThreadsHeaderFilterDemo,
  ThreadsHeaderSearchDemo,
  ToolActivityDemo,
  ToolInputBlocksDemo,
  ToolbarDemo,
  WorkflowSurfaceDemo,
} from './compositions/demos';

const fps = 30;
const fullDuration = 1740;
const demoDuration = 240;

export const RemotionRoot = () => {
  return (
    <>
      <Composition id="AgentBuddyFilm" component={AgentBuddyFilm} durationInFrames={fullDuration} fps={fps} width={1440} height={900} />
      <Composition id="AgentBuddyFilmSquare" component={AgentBuddyFilmSquare} durationInFrames={fullDuration} fps={fps} width={1080} height={1080} />
      <Composition id="ToolbarDemo" component={ToolbarDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ChatComposerDemo" component={ChatComposerDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ChatComposerWithAttachmentDemo" component={ChatComposerWithAttachmentDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ChatComposerModeMenuDemo" component={ChatComposerModeMenuDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ChatComposerPhaseMenuDemo" component={ChatComposerPhaseMenuDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="TaskListPanelDemo" component={TaskListPanelDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="TaskListPanelMenuDemo" component={TaskListPanelMenuDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="TaskListPanelRowMenuDemo" component={TaskListPanelRowMenuDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="NotesRightRailDemo" component={NotesRightRailDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="NotesRightRailSearchDemo" component={NotesRightRailSearchDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="NotesRightRailMenuDemo" component={NotesRightRailMenuDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="NotesRightRailTrashDemo" component={NotesRightRailTrashDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="NotesRightRailTrashActionsDemo" component={NotesRightRailTrashActionsDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ThreadsHeaderDemo" component={ThreadsHeaderDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ThreadsHeaderSearchDemo" component={ThreadsHeaderSearchDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ThreadsHeaderFilterDemo" component={ThreadsHeaderFilterDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ThreadsHeaderArchiveDemo" component={ThreadsHeaderArchiveDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="KanbanComponentsDemo" component={KanbanComponentsDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="CodeReviewDemo" component={CodeReviewDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="SourceControlPanelDemo" component={SourceControlPanelDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ToolActivityDemo" component={ToolActivityDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="InteractionBlocksDemo" component={InteractionBlocksDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ToolInputBlocksDemo" component={ToolInputBlocksDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="InteractionControlsDemo" component={InteractionControlsDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ContentBlocksDemo" component={ContentBlocksDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="MessageBubbleDemo" component={MessageBubbleDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="PlanArtifactDemo" component={PlanArtifactDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="PullRequestPanelDemo" component={PullRequestPanelDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="PullRequestFilesDemo" component={PullRequestFilesDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="PullRequestCreateDemo" component={PullRequestCreateDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="PullRequestDetailsDemo" component={PullRequestDetailsDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="TerminalPanelDemo" component={TerminalPanelDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="FlowPaletteDemo" component={FlowPaletteDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="FlowNodeVariantsDemo" component={FlowNodeVariantsDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="FlowCanvasDemo" component={FlowCanvasDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="FlowNodeFormDemo" component={FlowNodeFormDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="BoardSurfaceDemo" component={BoardSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="CodeSurfaceDemo" component={CodeSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="NotesSurfaceDemo" component={NotesSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="ChatSurfaceDemo" component={ChatSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
      <Composition id="WorkflowSurfaceDemo" component={WorkflowSurfaceDemo} durationInFrames={demoDuration} fps={fps} width={1440} height={900} />
    </>
  );
};
