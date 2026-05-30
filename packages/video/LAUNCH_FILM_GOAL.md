# AgentBuddy Launch Film Goal

## Mission

Ship a polished Remotion-driven AgentBuddy launch film that feels authored and cinematic while showing UI that is recognizably the real product.

The film is built from reusable React/Remotion replicas of AgentBuddy UI, not Electron captures, Playwright screenshots, screenshot carousels, or invented product screens.

`packages/video/STORYBOARD.md` is the source of truth for the film's persona, project, story, canonical names, thread IDs, branch, command, chapter beats, and continuity map. If implementation state, copy, or timing conflicts with `STORYBOARD.md`, update the implementation to match the storyboard unless the storyboard itself is intentionally revised first.

## Non-Negotiables

- Every app-like surface must be source-backed by renderer code, renderer styles, or current app screenshots.
- Shared replicas live in `packages/video/src/agentbuddy-ui/**`; shots compose those replicas instead of creating local fake UI.
- Film-only elements, captions, cursor layers, camera choreography, and external preview windows live outside `agentbuddy-ui`.
- If a UI surface is not faithful enough, remove it from the cut until it can be rebuilt properly.
- Do not add fake plugin panels, fake browser panes, fake typing indicators, filler grids, black-flash transitions, or whole-app grow-ins.

## Current Scope

Required for this launch film:

- Story continuity: one session following Sam shipping Supafan's checkout flow, exactly as defined in `STORYBOARD.md`.
- Shared canonical state: threads, recent threads, dashboard tabs, kanban cards, notes references, branch/worktree/PR data, workflow command, logs, and database results must reuse the same names/IDs across chapters.
- App chrome and toolbar, including correct icons, active states, and pinned lower plugins.
- Chat and threads: composer, messages, tool activity, references, artifacts, recent threads, and thread board navigation.
- Notes: home, search, new note, editor, right rail, tasklist panel, task rows, and checkbox completion.
- Code and PR: source control, pull request files/create/details views, terminal, Monaco-backed code views, and a separate chrome-like localhost preview prop.
- Flows: blueprint canvas, palette, nodes, handles, and real elbow-edge routing for the `/supafan deploy-checkout` workflow.
- Final lockup: brand copy on plain black, not inside app chrome.

Out of scope until rebuilt with the same fidelity:

- Brain, database, logs, settings, prompts, actions, library, and any montage beat that depends on unfinished plugin UI.

## Motion Standard

- Component-first moments must spatially resolve into the real app layout.
- Individual components can appear first, but they should slide or settle into the exact place they occupy in the full UI.
- Normal navigation should behave like the app: click the real control, then show the destination state directly.
- Do not hide missing states with black frames, crossfades, centered cards, or whole-app scale transitions.
- Product UI and film-only props must remain visually and structurally separate.

## Chapter Beats

Do not invent chapter story beats in this file. The detailed beats live in `packages/video/STORYBOARD.md`; this section only captures implementation constraints.

Chat and threads:

- Follow `STORYBOARD.md` Chapter 1 exactly: Sam starts in `Checkout flow implementation`, references `#notes:current`, receives a checkout implementation plan, opens recent threads, switches to `Stripe payment integration`, and sends the review quick prompt.
- Navigate to the thread board by clicking the real thread title/control.
- Avoid black frames and grow-in transitions during navigation.

Board:

- Follow `STORYBOARD.md` Chapter 2 exactly: dashboard tabs, artifact sidebar, `Add discount code support` create form, linked parent `Checkout flow implementation`, list/kanban state, and card movement must remain continuous with Chat and Notes.
- Do not create, pin, select, move, or change thread state without a visible mouse action when the app would require one.

Notes:

- Follow `STORYBOARD.md` Chapter 3 exactly: Supafan notes home, checkout-current note, tasklist panel, receipt email completion, and `#threads: Add discount code support` reference.
- Show the Notes right rail only after leaving home.
- Use the right rail to open Tasklist, then show the tasklist left panel.
- Open a todo note and mark it complete using real task row and checkbox styling.
- Do not show the chat composer or bottom thread tabs in Notes shots unless the real Notes plugin would.

Code and PR:

- Follow `STORYBOARD.md` Chapter 4 exactly: `~/Supafan`, `sam/checkout-flow`, checkout-service diff, receipt/discount files, checkout tests, PR #42, and Sam as author.
- Match the real source-control hierarchy: panel header, directory selector, feature toolbar, branch selector, commit message, changes, commits, worktrees, and terminal.
- Include PR files/diff, publish branch, create PR, and PR details states.
- Use Monaco for code viewers.
- Show localhost output in a separate chrome-like film prop, never as an in-app fake browser.

Flows:

- Treat flows as blueprints, not runtime/composer/status UI.
- Follow `STORYBOARD.md` Chapter 5 exactly: `/supafan deploy-checkout`, deploy checkout flow list, listener, switch, migrations action, notify action.
- Start the workflow chapter with only the listener node on a plain black background.
- Attach the switch node while still isolated, then progressively reveal the real app canvas, header, toolbar, palette, and follow-on nodes.
- Do not show the full flow canvas or app shell at the start of the workflow shot.
- Do not show brain-plugin status indicators on flow nodes.
- Route edges as app-like elbow paths that attach to real handles.

Montage:

- Follow `STORYBOARD.md` Chapter 6 exactly: command, logs, database, and settings must continue the Supafan checkout deploy story.
- Do not include unrelated obsolete-app, AgentBuddy-launch-film, fake plugin, or filler-grid beats.

Final:

- Use only brand copy on black.
- Do not wrap the final lockup in app chrome.

## Working Loop

1. Pick the next visible weak segment.
2. Inspect renderer source and screenshots for that exact UI.
3. Patch shared replica components or state, not one-off shot mockups.
4. Render or sample the affected section.
5. Repeat until the section reads as the real app before expanding scope.

Keep fidelity notes useful and brief. Do not spend more time auditing than building, and do not add audit files unless they directly guide implementation.

## Done Criteria

- Landscape and square renders complete.
- Chat, threads, notes, code/PR, and flows show visible product action.
- Every visible app-like surface is source-backed or screenshot-backed.
- Component-to-app transitions are spatially coherent.
- No known ad hoc app UI remains in the cut.
