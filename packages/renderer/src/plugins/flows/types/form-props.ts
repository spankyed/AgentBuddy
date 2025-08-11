import type { ActionEntity, FlowEntity, ModelConfig, PromptEntity } from '@app/api'

export interface FormResources {
  actions?: ActionEntity[]
  flows?: FlowEntity[]
  models?: ModelConfig[]
  prompts?: PromptEntity[]
} 