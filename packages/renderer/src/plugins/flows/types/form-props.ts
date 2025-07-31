import type { ActionEntity, ModelConfig, PromptEntity } from '@app/api'

export interface FormResources {
  actions?: ActionEntity[]
  models?: ModelConfig[]
  prompts?: PromptEntity[]
} 