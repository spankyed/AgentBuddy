# AgentBuddy Launch Film Goal

## Goal

Ship a Remotion-driven AgentBuddy launch film built from reusable React replicas of the real AgentBuddy UI. The film should be cinematic and fully controllable in Remotion, but every app-like surface shown must read as the real product.

## Core Rules

- No Electron capture, Playwright recording, screenshot carousel, or fake marketing UI.
- `packages/video/src/agentbuddy-ui/**` is the source-backed app replica layer. Do not put loose mockups there.
- Every visible app-like component must map to real renderer code, real renderer CSS/theme, or an actual app screenshot.
- Film-only graphics must live outside the app replica layer and must not pretend to be AgentBuddy UI.
- If a surface cannot be made faithful enough, remove it from the cut until it can be rebuilt properly.
- Prefer fixing shared components and state models over one-off shot overlays.

## Current Fidelity Targets

Work through visible film segments and replica components until no ad hoc app UI remains. The immediate known problem areas are:

- Recent Threads menu.
- Inline note/reference pills.
- Reference autocomplete menu.
- Chat composer spacing and floating behavior.
- Notes chapter staging, navigation, right rail, tasklist panel, and task rows.
- Code source-control and PR panel layout.
- Flows blueprint identity, node styling, handles, and elbow-edge routing.

## Required Surfaces In The Cut

- App chrome and toolbar, including pinned plugin placement and active states.
- Chat composer, messages, tool activity, references, recent threads, and artifacts.
- Threads dashboard/board and navigation into a thread.
- Notes home, new-note flow, editor, right rail, tasklist panel, and task completion.
- Code source control, PR files/create/details views, terminal, and Monaco-backed code views.
- Flows blueprint canvas, palette, nodes, handles, and edges.
- Final lockup as pure film graphics on black.

Only show brain, database, logs, settings, prompts, actions, or library if the visible UI has been rebuilt with the same renderer-backed fidelity. Do not add quick fake plugin screens.

## Motion Rules

- Component-first moments should preserve spatial continuity: isolated components may start staged, but they must settle into their real app position.
- Normal app navigation should look like navigation: click the real control, then show the destination state directly.
- Do not use black flashes, generic crossfades, fake card expansion, or whole-app grow-ins to hide unfinished transitions.
- Cursor motion should imply expert use without becoming the focus.

## Notes Chapter Contract

The notes chapter should follow this product flow:

1. Start on Notes home.
2. Type `Good afternoon`.
3. Reveal search, `+ New note`, and Recently visited.
4. Click `+ New note`.
5. Navigate directly into a new note editor and type the launch note content.
6. Show the Notes right rail once no longer on the home view.
7. Click `Tasklist` from the right rail.
8. Navigate to the tasklist overview.
9. Show the tasklist left panel only once the tasklist note is active.
10. Click a todo note, open it, and mark it complete with the real task row/checkbox styling.

Do not show the chat composer or bottom thread tabs in notes shots unless the real Notes plugin would show them for that exact state.

## Working Loop

For each segment or component:

1. Inspect the real renderer source and any available app screenshot.
2. Compare the replica against that source.
3. Patch shared UI/state.
4. Render or sample frames.
5. Move on only when the visible result reads as the real app.

Keep `packages/video/src/agentbuddy-ui/FIDELITY.md` as the source map for replica components. It should document evidence, not become an excuse for audit-only work.

## Done

This goal is done when:

- The landscape film renders successfully.
- Every visible app-like surface has renderer/screenshot evidence.
- No known ad hoc app UI remains in the cut.
- Chat, threads, notes, code/PR, and flows have been reviewed in rendered frames.
- The notes chapter follows the contract above.
- Film-only visuals are clearly separated from AgentBuddy UI.
