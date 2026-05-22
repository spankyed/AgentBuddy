// Re-export all shared thread types
export * from '@/core/shared-types/threads';

// Re-export agent/chat types that moved to shared-types/settings
// (they were originally defined in this file)
export type { AgentSettings, AgentMode, AgentPhase, QuickPrompt, CommandItem } from '@/core/shared-types/settings';

// Re-export ThreadTagOption for backward compat (was re-exported from settings)
export type { ThreadTagOption } from '@/core/shared-types/settings';
