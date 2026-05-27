# AgentBuddy Launch Film Goal

## Current Goal

Build a complete Remotion-driven AgentBuddy launch film using reusable React components that closely mirror the real app UI. The film should feel like captured product usage, but remain fully controllable in Remotion for timing, camera, cursor, state changes, and component-level staging.

This is not an Electron screenshot pipeline, a Playwright recording, a QA capture, or a fake marketing UI. Any app surface shown in the film should either be a near 1:1 recreation of the real AgentBuddy UI or live in clearly separated film-only code when it is not part of the app.

## What Matters Most

- Real Remotion-driven video logic.
- Reusable component-level app surfaces, split across separate files.
- Near 1:1 clones of the real app UI for the surfaces shown in the film.
- Progressive component staging is a first-class requirement: important components should begin centered or isolated, then slide/settle into their real position inside the full app surface. Do not cut from an isolated component to a fully assembled app unless the app itself is navigating.
- Navigation should behave like the real app. Avoid black transitions, generic grow-ins, or fake scene transitions when the user action is just app navigation.
- No fake plugin surfaces, no ad hoc UI, no invented widgets pretending to be real product UI.
- No audit-heavy detours unless they directly unblock visible film quality.

## Notes Chapter Target

The notes chapter is the clearest place to prove the film can move from isolated product components into full app context without fake transitions. It must demonstrate the real Notes workflow through controlled Remotion state changes while preserving app fidelity.

The chapter should not begin with a complete app window popping, scaling, or growing into view. It should begin with the Notes home surface staged intentionally in the middle of the frame, then have those same real components slide and settle into their actual app positions as the full Notes layout becomes visible.

Required narrative sequence:

1. Start on the Notes home view, not an editor and not a tasklist note.
2. Type out `Good afternoon` on the Notes home surface.
3. Reveal the real Notes home controls: search, `+ New note`, and `Recently visited`.
4. Click `+ New note`.
5. Navigate directly into a new note editor.
6. Type the launch note content into the editor.
7. Show the Notes right rail as soon as the shot leaves the Notes home/recents state.
8. From the right rail, click the `Tasklist` note.
9. Navigate the main content to the tasklist overview note.
10. Show the tasklist left panel only after the tasklist note is active.
11. Click a todo note from the tasklist left panel.
12. Navigate the main content to that todo note.
13. Mark the todo complete using the real task row/checkbox styling.

Required motion and staging:

- The Notes home component should be the staged hero object at the beginning of the chapter.
- The staged Notes home component must become the full app view by moving into place, not by being replaced with a separate render.
- New controls should enter as real app controls, not as film-only labels or decorative overlays.
- The `+ New note` click should produce app navigation, not a black cut, grow transition, or generic crossfade.
- The right rail should appear because the app entered note-editing context.
- The tasklist panel should appear because the selected note is a tasklist, not because a layout panel randomly slides in.
- Panel transitions can be authored, but they must preserve spatial continuity and real app identity.

Specific notes chapter constraints:

- Do not show the chat composer over notes shots.
- Do not show the bottom thread tabs in notes shots unless the real Notes plugin would show them for that exact app state.
- Do not begin by growing in the whole app as the first notes shot.
- Do not click a recent note card for the primary beat; the primary action is `+ New note`.
- Do not use a fake card expansion transition for note navigation.
- The right Notes rail should be present during note editing and tasklist work.
- The tasklist left panel should only appear once the tasklist note is active.
- Styling should match the real Notes plugin, including panel structure, spacing, right rail behavior, task rows, checkboxes, note editor typography, scrollbars, and selected row states.

## Full-Film Review Loop

Continue improving the film by watching rendered output in short intervals and fixing visible issues before moving forward. The interval does not have to be exactly three seconds; use the smallest review slice that exposes the problem.

For each review pass:

1. Inspect the actual rendered frames or video segment.
2. Identify concrete fidelity, motion, layout, or narrative issues.
3. Fix the issue in the reusable component or shot state, not with one-off hacks.
4. Re-render or sample frames enough to verify the fix.
5. Continue to the next segment only after the current segment is acceptable.

Priority issues to catch during these passes:

- Abrupt component-to-app transitions.
- Black flashes or fake fades during normal app navigation.
- Chat composer appearing in non-chat chapters.
- Film-only UI being mistaken for real app UI.
- Incorrect plugin identity, especially flows versus brain-like execution/status UI.
- Any ad hoc surface that should instead be a 1:1 app component recreation.

## Current Wrap-Up Criteria

- The film renders successfully in landscape.
- The notes chapter follows the sequence above without abrupt app-grow transitions.
- The chat, board, notes, code, PR, flows, and final shots use real-looking AgentBuddy surfaces.
- Any remaining non-app visuals are clearly isolated as film-only components.
- The output is good enough to review as a product film, not just as a component proof.
