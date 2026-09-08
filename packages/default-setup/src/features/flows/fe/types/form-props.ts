import type { ActionEntity, FlowEntity, ModelCatalogEntry, PromptEntity } from '@/__generated__/types'

export interface FormResources {
  actions?: ActionEntity[]
  flows?: FlowEntity[]
  models?: ModelCatalogEntry[]
  prompts?: PromptEntity[]
  [key: string]: unknown[] | undefined
} 