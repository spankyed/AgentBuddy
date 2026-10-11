import type { ActionEntity, FlowEntity, PromptEntity } from '@apackdev/sdk'
import type { ModelCatalogEntry } from '@apackdev/sdk/models'

export interface FormResources {
  actions?: ActionEntity[]
  flows?: FlowEntity[]
  models?: ModelCatalogEntry[]
  prompts?: PromptEntity[]
  [key: string]: unknown[] | undefined
} 