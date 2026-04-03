## Problem

When a node is selected on the canvas and the user clicks a step type in the palette, a new node is created with an automatic edge connecting the selected node to the new one. The new node is placed at a naive fixed offset (+200px to the right) of the selected node instead of being positioned by ELK layout.

This is most noticeable when the selected node is a listener with multiple exit rows — the new connected step just lands at the blind offset rather than being placed where it actually belongs relative to the listener's exit structure.

Drag-drop and nodes created without a selection are fine — the issue is specifically palette-click creation when an auto-edge is involved.

## Goal

After a node is created from the palette with an auto-edge, ELK layout should determine where the new node ends up on the canvas.

## What has been tried

Two approaches were attempted and both reverted:

1. **`LAYOUT_COMPUTED` approach** — Called `calculateLayoutAsync` in the `createNode` action and sent `LAYOUT_COMPUTED` with the result. This replaced ALL node positions on the canvas with ELK-computed ones, causing every existing node to jump.

2. **`NODE.UPDATE_POSITION` approach** — Same async layout call, but only sent `NODE.UPDATE_POSITION` for the newly created node (to avoid moving existing nodes). This also didn't work.

## Relevant area

The `createNode` action in `packages/renderer/src/plugins/flows/state.ts`. This is where the node, auto-edge, and initial position are all computed within an `assign()` action.
