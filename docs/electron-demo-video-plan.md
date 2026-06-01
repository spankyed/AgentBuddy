# Electron Demo Video Plan

## Goal

Generate faithful AgentBuddy product demo videos from the actual Electron app UI, then use Remotion only as the video compositor.

The first milestone is intentionally narrow:

- one fixture: `product-intro`
- three scenes: `workspace`, `chat`, `artifact`
- three isolated Electron captures
- one Remotion composition
- one MP4 output

## V1 Architecture

`packages/video` is the pipeline orchestrator. Electron is the faithful capture runtime, but the Electron app should not own the full video workflow.

```text
packages/video CLI
  -> launch Electron once for workspace scene
  -> Electron captures one PNG
  -> Electron exits
  -> launch Electron once for chat scene
  -> Electron captures one PNG
  -> Electron exits
  -> launch Electron once for artifact scene
  -> Electron captures one PNG
  -> Electron exits
  -> packages/video runs Remotion renderMedia()
  -> output MP4
```

Remotion remains compositor-only. It uses captured Electron screenshots plus overlays, captions, zooms, highlights, cursor movement, and transitions.

## Commands

Add split commands:

```sh
npm run video:capture -- product-intro workspace
npm run video:capture -- product-intro chat
npm run video:capture -- product-intro artifact
npm run video:render -- product-intro
npm run video:demo -- product-intro
```

`video:demo` is orchestration only:

```text
capture workspace
capture chat
capture artifact
render MP4
```

## Electron Launch Shape

Launch Electron once per scene:

```sh
electron . \
  --demo product-intro \
  --demo-scene workspace \
  --capture-output ./packages/video/out/product-intro/captures/workspace.png
```

Repeat for:

```text
workspace.png
chat.png
artifact.png
```

The renderer must not know capture output paths.

## Demo Config Flow

Main process parses:

```ts
{
  enabled: true,
  id: 'product-intro',
  scene: 'workspace',
  captureOutput: './packages/video/out/product-intro/captures/workspace.png'
}
```

Preload exposes only:

```ts
window.electronAPI.demo = {
  enabled: true,
  id: 'product-intro',
  scene: 'workspace',
}
```

Renderer never receives filesystem paths.

Add preload IPC:

```ts
window.electronAPI.demoReady()
```

Renderer calls `demoReady()` after fixture hydration, app layout stabilization, and font readiness.

Main process then:

1. receives `demo:ready`
2. waits one stabilization tick if needed
3. calls `webContents.capturePage()`
4. writes PNG to `captureOutput`
5. exits Electron

## Files To Change

### Video Package

- `packages/video/package.json`
  - Add `video:capture`, `video:render`, and `video:demo` workspace scripts.
- `packages/video/scripts/capture-demo-scene.ts`
  - Launch Electron for one scene and wait for exit.
- `packages/video/scripts/render-demo.ts`
  - Run Remotion `renderMedia()` using existing captured PNGs.
- `packages/video/scripts/demo.ts`
  - Orchestrate all captures, then render.
- `packages/video/src/compositions/ElectronCaptureDemo.tsx`
  - Compose captured frames.
- `packages/video/src/demo/product-intro.ts`
  - Scene list, capture filenames, captions, zoom timing, highlight rectangles.

### Main Process

- `packages/entry-point.mjs`
  - Parse `--demo`, `--demo-scene`, `--capture-output`.
- `packages/main/src/AppInitConfig.ts`
  - Add optional demo capture config.
- `packages/main/src/index.ts`
  - Thread demo config into modules.
- `packages/main/src/modules/window-manager/WindowManager.ts`
  - Keep responsibility limited to deterministic BrowserWindow creation in demo mode:
    - fixed size
    - stable background
    - fixed zoom factor
    - pass demo args to preload
    - avoid capture lifecycle logic here
- `packages/main/src/modules/demo-capture/DemoCaptureController.ts`
  - Listen for `demo:ready`.
  - Find or receive the main `BrowserWindow`.
  - Wait one stabilization tick.
  - Call `webContents.capturePage()`.
  - Save PNG to `captureOutput`.
  - Exit app.
- `packages/main/src/modules/demo-capture/index.ts`
  - Export the focused demo capture module.

### Preload

- `packages/preload/src/index.ts`
  - Expose:

```ts
electronAPI.demo
electronAPI.demoReady()
```

- `packages/renderer/src/electron.d.ts`
  - Type both APIs.

### Renderer

- `packages/renderer/src/main.ts`
  - Read `window.electronAPI.demo`.
- `packages/renderer/src/core/actors/application.ts`
  - Add demo-aware initialization through normal app flow where possible.
- `packages/renderer/src/demo/types.ts`
- `packages/renderer/src/demo/fixtures/product-intro.ts`
- `packages/renderer/src/demo/adapters.ts`
- `packages/renderer/src/demo/apply-demo-scene.ts`

## Demo Adapters

Do not broadly skip backend wait or special-case the app into a fake shell.

Prefer demo adapters:

- mocked service responses
- mocked bus adapters
- backend-shaped fixture data
- normal actor events
- normal plugin/view selection

Acceptable fallback:

```ts
{ type: 'DEMO.HYDRATE', fixture, scene }
```

Avoid:

- direct Vue ref mutation
- direct XState snapshot mutation
- DOM manipulation hacks

## Deterministic Controls

Demo mode must stabilize:

- window size
- device scale factor
- zoom factor
- theme
- panel sizes
- selected plugin/view
- timestamps/dates
- randomness
- animation timing
- font loading readiness

Renderer should call readiness only after stabilization:

```ts
await document.fonts.ready;
await nextTick();
requestAnimationFrame(() => {
  requestAnimationFrame(() => window.electronAPI.demoReady());
});
```

Main may still wait one short stabilization tick before capture.

## Implementation Order

1. Define demo capture config and parse CLI args.
2. Pass demo config from `entry-point.mjs` to main modules.
3. Add deterministic demo `BrowserWindow` options.
4. Add focused `DemoCaptureController`.
5. Expose `electronAPI.demo` and `electronAPI.demoReady()` from preload.
6. Add renderer fixture and demo adapters.
7. Hydrate one scene and call `demoReady()`.
8. Capture one PNG with `webContents.capturePage()`.
9. Extend capture to all three scenes.
10. Add Remotion composition using captured PNGs.
11. Add `video:capture`, `video:render`, and `video:demo` scripts.
12. Verify one command produces the MP4.

## Not V1

Do not build:

- renderer Video plugin
- backend video API
- React recreation of Vue UI
- live recording
- narration generation
- generalized template system
- packaged Remotion support
- `app.asar` handling
- packaged browser binaries
- runtime packaged Remotion bundle logic

Packaged Remotion support is future work only.
