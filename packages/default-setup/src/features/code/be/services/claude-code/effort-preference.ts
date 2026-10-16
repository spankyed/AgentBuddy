import { z } from 'zod'
import type { ClaudeConfigurationSummary } from './configuration-summary.ts'
/** Persistable native user-model levels; max is acknowledged without saving in the pinned writer. */
export const ClaudePersistedEffortSchema = z.enum(['low', 'medium', 'high', 'xhigh'])
export type ClaudePersistedEffort = z.infer<typeof ClaudePersistedEffortSchema>
export interface ClaudeEffortPreferenceReceipt {
  /** Safe post-ack native readback; null means the write outcome cannot be checked here. */
  configuration: ClaudeConfigurationSummary | null
}
