import type { ActionEntity, FlowEntity, ModelCatalogEntry, PromptEntity } from '@app/api'

export interface FormResources {
  actions?: ActionEntity[]
  flows?: FlowEntity[]
  models?: ModelCatalogEntry[]
  prompts?: PromptEntity[]
} 