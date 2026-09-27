// Build entry: importing index.ts runs its contextBridge.exposeInMainWorld('electronAPI', ...) side effect.
import './index.ts';

// Re-export for tests
export * from './index.ts';
