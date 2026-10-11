import type { ActionEntity, FlowEntity, PromptEntity } from '@apack/sdk'
import type { ModelCatalogEntry } from '@apack/sdk/models'

export interface FormResources {
  actions?: ActionEntity[]
  flows?: FlowEntity[]
  models?: ModelCatalogEntry[]
  prompts?: PromptEntity[]
  [key: string]: unknown[] | undefined
} 