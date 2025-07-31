// In Electron, we use the preload-exposed tRPC client
import { trpc } from '@app/preload';

// Re-export for compatibility with existing code
export { trpc };