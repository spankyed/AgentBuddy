/**
 * Hermes management system types — events and data shapes.
 */

import type { HermesSkill, HermesModel, HermesTool, HermesMemoryFiles, BridgeInfo } from '@/services/hermes/types'

export interface HermesConnectedData {
  bridge: BridgeInfo
  skills: HermesSkill[]
  models: HermesModel[]
  tools: { tools: HermesTool[]; enabledToolsets: string[] }
  persona: { content: string; path: string }
  memory: HermesMemoryFiles
  workspaces: string[]
}

export type { HermesSkill, HermesModel, HermesTool, HermesMemoryFiles, BridgeInfo }
