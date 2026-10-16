import { z } from 'zod'

const projection = z.object({
  effective: z.object({ model: z.string().optional(), effortLevel: z.string().optional(),
    modelSettings: z.record(z.unknown()).optional(),
  }),
  applied: z.object({ model: z.string(), effort: z.string().nullable() }),
  errors: z.array(z.unknown()).optional(),
})
export interface ClaudeConfigurationSummary {
  configuredModel?: string
  configuredEffort?: string
  perModelEffort?: string
  appliedModel: string
  appliedEffort: string | null
  configurationErrorCount: number
}
/** Explicit allowlist: never return raw environment, helper commands, sources or validation messages. */
export function getClaudeConfigurationSummary(response: unknown): ClaudeConfigurationSummary {
  const { effective, applied, errors } = projection.parse(response)
  const entry = effective.modelSettings && Object.hasOwn(effective.modelSettings, applied.model) ? effective.modelSettings[applied.model] : undefined
  const perModel = z.object({ effortLevel: z.string().optional() }).parse(entry ?? {})
  return { configuredModel: effective.model, configuredEffort: effective.effortLevel,
    perModelEffort: perModel.effortLevel,
    appliedModel: applied.model, appliedEffort: applied.effort, configurationErrorCount: errors?.length ?? 0 }
}
