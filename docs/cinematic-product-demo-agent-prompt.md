# AgentBuddy Cinematic Product Demo Agent Prompt

## Mission

You are taking over the AgentBuddy product demo video system.

The current implementation is technically useful but creatively bad: it renders a sequence of static Electron screenshots with text overlays. That is not acceptable.

Your goal is to turn this into a real launch-quality product demo suitable for Twitter/X, LinkedIn, and product launch pages.

This must feel like a modern product film, not a QA capture, slideshow, or tutorial.

Reference quality bar:

- Linear
- Raycast
- Vercel
- Arc
- Cursor

The viewer should feel:

> "This replaces half my stack."

## Current State

Repo: AgentBuddy

Existing work:

- Electron demo capture pipeline exists.
- Demo mode launches Electron once per scene.
- Real backend is bypassed in demo mode.
- Renderer demo state is fixture/mock-backend driven.
- Electron captures PNGs plus JSON metadata.
- Metadata includes DOM bounding boxes from `data-targeting-id` / `data-onboarding-id`.
- Remotion currently composes captures into video.
- Existing cinematic demo output is bad because it is just still screenshots with camera drift and text.

Relevant files:

- `packages/video/src/compositions/CinematicProductDemo.tsx`
- `packages/video/src/demo/product-intro.ts`
- `packages/video/scripts/capture-demo-scene.ts`
- `packages/video/scripts/render-demo.ts`
- `packages/main/src/modules/demo-capture/DemoCaptureController.ts`
- `packages/renderer/src/demo/mock-backend.ts`
- `packages/renderer/src/demo/apply-demo-scene.ts`
- `packages/renderer/src/demo/fixtures/cinematic-product-demo.ts`
- `packages/renderer/src/demo/types.ts`

Existing commands:

```sh
npm run video:capture -- cinematic-product-demo <scene>
npm run video:render -- cinematic-product-demo
npm run video:demo -- cinematic-product-demo
```

Generated output currently lands at:

```sh
packages/video/out/cinematic-product-demo/cinematic-product-demo.mp4
```

## Hard Requirement

Do not make another slideshow.

The video must contain actual apparent product action:

- UI state changes
- text appearing
- streamed AI responses
- panels opening/collapsing
- tabs switching
- task/card movement
- notes being edited
- artifact changes
- terminal/logs streaming
- workflow graph changes
- rapid montage cuts

If the real Vue UI cannot animate those interactions naturally, simulate action in Remotion using captured UI layers, masks, overlays, cursor motion, and frame-to-frame scene variants.

## Recommended Architecture

Keep Electron capture as the source of truth for visual fidelity, but capture multiple states per moment, not one static screenshot per chapter.

Instead of:

```text
scene -> one PNG -> drift camera over still image
```

Use:

```text
moment -> multiple captured states + metadata -> Remotion creates motion between them
```

For example:

```text
chat_start.png
chat_typing.png
chat_stream_mid.png
chat_stream_done.png
chat_quick_prompt.png
```

Then Remotion animates:

- cursor movement
- text insertion
- stream reveal masks
- panel focus
- match cuts
- zooms
- depth/blur
- UI element overlays
- transition timing

## Concrete Implementation Plan

### 1. Redesign Demo Model Around Moments

Replace or extend the current scene model.

A moment should include:

```ts
type DemoMoment = {
  id: string;
  chapter: string;
  durationInFrames: number;
  captures: Array<{
    id: string;
    electronScene: string;
    png: string;
    metadata: string;
  }>;
  motion: {
    cameraTargetId?: string;
    cursorPath?: Array<{ x: number; y: number; frame: number }>;
    type?: 'stream' | 'type' | 'switch' | 'drag' | 'montage' | 'terminal' | 'graph';
  };
  copy?: {
    kicker?: string;
    headline?: string;
    subline?: string;
  };
};
```

The important change is that one video moment can use multiple Electron captures.

### 2. Add Richer Renderer Demo States

The renderer mock backend should support multiple deterministic states for the same workflow.

Examples:

- `chat-empty`
- `chat-user-message`
- `chat-streaming`
- `chat-response-complete`
- `chat-quick-prompt-open`
- `threads-kanban-backlog`
- `threads-kanban-in-progress`
- `note-edit-before`
- `note-edit-after`
- `code-git-before`
- `code-git-commit-message`
- `workflow-command-before`
- `workflow-command-after`
- `logs-stream-a`
- `logs-stream-b`

Do not rely on live backend logic.

Drive Vue actors with backend-shaped events where possible.

Fallback is acceptable:

```ts
{ type: 'DEMO.HYDRATE', fixture, scene }
```

Avoid:

- direct DOM mutation
- mutating Vue refs
- mutating XState snapshots
- pretending a single screenshot is an interaction

### 3. Capture Enough States To Imply Real Motion

The first usable launch film should have roughly 25-40 captured PNGs, not 16.

Minimum useful capture set:

Chapter 1, AI chat:

- `chat_empty`
- `chat_reference_note`
- `chat_image_pasted`
- `chat_streaming`
- `chat_done`
- `chat_quick_prompt`
- `thread_pinned`
- `ticket_created`
- `kanban_before`
- `kanban_after`

Chapter 2, Notes:

- `note_open`
- `note_editing`
- `note_image_inserted`
- `note_thread_pill`
- `tasks_before`
- `tasks_after`

Chapter 3, Code:

- `code_changes`
- `commit_message_generated`
- `branch_published`
- `pr_created`
- `terminal_start`
- `local_app_launched`

Chapter 4, Workflows:

- `workflow_graph`
- `command_listener`
- `command_defined`
- `automation_running`

Final montage:

- `brain_graph`
- `logs_stream`
- `database_query`
- `settings_personalization`
- `threads_dashboard`
- `workflow_execution`

### 4. Make Remotion Do Real Motion Design

Rewrite `CinematicProductDemo.tsx`.

It should not be a generic loop over screenshots.

Build shot components such as:

- `ChatStreamShot`
- `TypeIntoInputShot`
- `KanbanMoveShot`
- `NoteEditShot`
- `CodeShipShot`
- `WorkflowGraphShot`
- `TerminalRunShot`
- `RapidMontageShot`
- `FinalLogoShot`

Each shot should have authored timing.

Use Remotion features:

- `Sequence`
- `Series`
- `spring`
- `interpolate`
- `Easing`
- masks / clipping
- layered images
- frame-based reveal
- motion blur approximation
- cursor overlay
- scale/translate camera moves
- selective dim/blur overlays
- text timing synced to actions

### 5. Use Captured DOM Metadata

The capture JSON already contains bounding boxes.

Use it for:

- camera target positioning
- cursor start/end points
- clipping/reveal masks
- zoom origin
- drag start/end
- focus zones

Do not use visible tutorial highlight rectangles except maybe ultra-subtle cinematic focus treatment.

### 6. Add A Cursor System

Create a polished cursor overlay in Remotion.

Requirements:

- no robotic straight-line movement
- use bezier paths
- slight overshoot
- velocity easing
- click pulses are subtle
- hide cursor during pure montage
- never let cursor be the star

The cursor should imply expert usage, not tutorial clicking.

### 7. Add Simulated Interaction Layers

For real action, use overlays when needed.

Examples:

- stream response text using a mask over final screenshot
- show typed text in chat input as overlay synchronized with cursor
- animate a kanban card from old rect to new rect between two captures
- reveal commit message line-by-line
- scroll logs by sliding captured log content
- transition workflow graph nodes with scale/opacity
- animate terminal command output using clipped text

These overlays should match app styling closely but only for action effects. Do not rebuild the whole Vue UI in React.

### 8. Improve Creative Structure

Target runtime: 75-100 seconds.

Pacing:

- 0-8s: brand setup, calm but premium
- 8-28s: chat becomes work
- 28-43s: notes and tasks
- 43-60s: code/git/dev loop
- 60-72s: workflows/automation
- 72-88s: rapid montage
- 88-96s: final lockup

No long captions.

Use short launch-film copy:

- "Conversation becomes work."
- "Memory stays connected."
- "Ship from the same surface."
- "Automate the system around you."
- "AgentBuddy"
- "The AI operating system for modern work."

### 9. Output Platform Variants

Create at least:

```sh
cinematic-product-demo-landscape.mp4
cinematic-product-demo-square.mp4
```

Optional:

```sh
cinematic-product-demo-vertical.mp4
```

Do not do platform variants until the primary cut is good.

## Acceptance Criteria

The final video is acceptable only if:

- It clearly shows AgentBuddy doing things, not sitting still.
- There are at least 10 moments with visible UI state change.
- There are at least 25 captured app states or equivalent layered states.
- No shot feels like "screenshot with pan."
- Captions are minimal and premium.
- Cursor motion, if used, feels human and fast.
- The edit has momentum and escalation.
- The final 15 seconds feel like a montage, not a grid of screenshots.
- The video can be posted publicly without apology.

## What Not To Do

Do not:

- make another generic screenshot carousel
- add big tutorial highlights
- over-explain features
- linger on forms
- show dead time
- rely on the real backend
- rebuild the app UI fully in React
- make fake marketing pages
- ship before watching the output critically

## First Task

Start by designing the shot list and required capture states.

Then implement the capture state model and Remotion shot components.

Render a first pass and inspect it critically. If it still feels static, add more intermediate captures and motion layers before handing it back.
