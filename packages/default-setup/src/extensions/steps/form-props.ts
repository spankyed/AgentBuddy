import type { ActionEntity, FlowEntity, PromptEntity } from '@abuddy/sdk'
import type { ModelCatalogEntry } from '@abuddy/sdk/models'

export interface FormResources {
  actions?: ActionEntity[]
  flows?: FlowEntity[]
  models?: ModelCatalogEntry[]
  prompts?: PromptEntity[]
  [key: string]: unknown[] | undefined
} 