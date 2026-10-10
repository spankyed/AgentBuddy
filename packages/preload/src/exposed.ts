// Build entry: importing index.ts runs its contextBridge.exposeInMainWorld('electronAPI', ...) side effect,
// which is the whole of what a preload does. The re-export carries nothing — the bridge's surface reaches a
// window through `contextBridge`, not through this module's exports — and is kept because a library build
// with no exports emits a bundle Electron then loads for its side effect alone, which reads as a mistake.
import './index.ts';

export * from './index.ts';
