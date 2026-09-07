import type { ActionEntity, FlowEntity, ModelCatalogEntry, PromptEntity } from '@/registries/types'

export interface FormResources {
  actions?: ActionEntity[]
  flows?: FlowEntity[]
  models?: ModelCatalogEntry[]
  prompts?: PromptEntity[]
  [key: string]: unknown[] | undefined
} 