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

The notes chapter must demonstrate the real Notes workflow through controlled Remotion state changes while preserving app fidelity. It should not start with the whole app popping or growing in. It should begin from the Notes home surface, progressively reveal the real controls, and then navigate through note creation and tasklist work.

Required sequence:

1. Start on the Notes home view.
2. Type out `Good afternoon`.
3. Reveal the search affordance, `+ New note`, and the `Recently visited` section as real Notes home elements.
4. Click `+ New note`.
5. Navigate directly to a new note editor.
6. Type the launch note content into the editor.
7. Show the Notes right side panel whenever editing a note or whenever no longer on the Notes home/recents view.
8. From the right side panel, click the `Tasklist` note.
9. Switch the main content to a tasklist overview note.
10. Show the tasklist left panel when the tasklist note is active.
11. Click a todo note in the tasklist left panel.
12. View that todo note.
13. Mark the todo complete.

Required staging behavior:

- The first notes beat should stage the Notes home content intentionally, not reveal a complete app window all at once.
- When moving from a focused component to the full app view, the component should travel into its real final location instead of being replaced by a separate full-app render.
- Navigation between Notes home, new note, tasklist overview, and todo note should feel like app navigation, not a film transition.
- The right rail and left tasklist panel should appear because the app state changed, not because a generic layout animated in.

Specific notes chapter constraints:

- Do not show the chat composer over notes shots.
- Do not begin by growing in the whole app as the first notes shot.
- Do not click a recent note card for the main beat; the primary action is `+ New note`.
- The right Notes rail should be present during note editing and tasklist work.
- The tasklist left panel should only appear once the tasklist note is active.
- Styling should match the real Notes plugin, including panel structure, spacing, right rail behavior, task rows, checkboxes, and note editor typography.

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
