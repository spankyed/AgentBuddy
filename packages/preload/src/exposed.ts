// Build entry: importing index.ts runs its contextBridge.exposeInMainWorld('electronAPI', ...) side effect.
import './index.js';

// Re-export for tests
export * from './index.js';
