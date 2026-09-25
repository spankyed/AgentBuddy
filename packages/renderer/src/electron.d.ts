// The Window.electronAPI declaration moved to the SDK, where packs can see it too.
// A triple-slash reference, not an import: an `import` would make this file a module and the
// `Window` augmentation it pulls in would stop being global.
// oxlint-disable-next-line typescript-eslint/triple-slash-reference
/// <reference path="../../abuddy-sdk/src/fe/electron-api.ts" />
