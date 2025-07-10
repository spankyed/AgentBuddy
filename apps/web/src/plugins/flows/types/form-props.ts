import type { ActionEntity, ModelConfig, PromptEntity } from '@abuddy/api'

export interface FormResources {
  actions?: ActionEntity[]
  models?: ModelConfig[]
  prompts?: PromptEntity[]
} 