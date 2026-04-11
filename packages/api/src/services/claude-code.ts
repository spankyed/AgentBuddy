/**
 * Thin re-export so action authors can `services.claudeCode.*` while the
 * implementation lives in `services/claude-code/`. Mirrors the split used
 * by other services (see `services/cli.ts`).
 */
export { claudeCodeService } from './claude-code/index';
export type { ClaudeCodeService, PermissionDecision, PermissionRequest } from './claude-code/index';
export type { ClaudeCodeSessionRecord } from './claude-code/repository';
