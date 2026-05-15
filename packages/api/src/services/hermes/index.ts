/**
 * Hermes Agent Service — public entry point.
 *
 * Wraps the Python bridge subprocess with a clean, typed API that mirrors
 * the claude-code service pattern. Used by both the brain system (actions/flows)
 * and the hermes management system.
 *
 * Usage:
 *   import { hermes } from '@/services/hermes'
 *
 *   await hermes.start()
 *   const sessions = await hermes.sessions.list()
 *   const handle = hermes.chat({ sessionId, message, model })
 */

import { HermesBridgeClient } from './bridge-client'
import { createLogger } from '@/core/helpers/debug/logger'
import type {
  HermesConfig,
  HermesSession,
  HermesSkill,
  HermesModel,
  HermesTool,
  HermesMemoryFiles,
  BridgeInfo,
} from './types'

export type * from './types'

const logger = createLogger('hermes-service')

// ─── Singleton Bridge ───────────────────────────────────────────────────────

let _bridge: HermesBridgeClient | null = null

function getBridge(): HermesBridgeClient {
  if (!_bridge) {
    _bridge = new HermesBridgeClient()
  }
  return _bridge
}

// ─── Service API ────────────────────────────────────────────────────────────

export const hermes = {
  /** Get the raw bridge client for low-level access. */
  get bridge(): HermesBridgeClient {
    return getBridge()
  },

  /** Start the bridge subprocess. */
  async start(config?: HermesConfig): Promise<BridgeInfo> {
    const bridge = getBridge()
    if (config) bridge.updateConfig(config)
    return bridge.start()
  },

  /** Stop the bridge subprocess. */
  async stop(): Promise<void> {
    return getBridge().stop()
  },

  /** Restart the bridge subprocess. */
  async restart(config?: HermesConfig): Promise<BridgeInfo> {
    const bridge = getBridge()
    if (config) bridge.updateConfig(config)
    return bridge.restart()
  },

  /** Get bridge status info. */
  get info(): BridgeInfo {
    return getBridge().info
  },

  /** Check bridge health. */
  async health(): Promise<{ status: string; agent_available: boolean }> {
    return getBridge().send('health')
  },

  // ── Sessions ────────────────────────────────────────────────────────────

  sessions: {
    async list(): Promise<HermesSession[]> {
      const result = await getBridge().send<{ sessions: HermesSession[] }>('listSessions')
      return result.sessions ?? []
    },

    async get(sessionId: string): Promise<Record<string, unknown>> {
      const result = await getBridge().send<{ session: Record<string, unknown> }>('getSession', { sessionId })
      return result.session
    },

    async create(opts: { model?: string; workspace?: string; title?: string } = {}): Promise<Record<string, unknown>> {
      const result = await getBridge().send<{ session: Record<string, unknown> }>('createSession', opts)
      return result.session
    },
  },

  // ── Chat ────────────────────────────────────────────────────────────────

  /**
   * Start a streaming chat turn. Returns a promise that resolves when done.
   * Call `onEvent` for each streaming token/tool event.
   */
  async chat(
    params: {
      sessionId?: string
      message: string
      model?: string
      workspace?: string
    },
    onEvent: (type: string, data: Record<string, unknown>) => void,
  ): Promise<Record<string, unknown>> {
    return getBridge().sendStreaming('chat', params, onEvent)
  },

  /** Cancel an active stream. */
  async cancelStream(streamId: string): Promise<{ cancelled: boolean }> {
    return getBridge().send('cancelStream', { streamId })
  },

  // ── Models ──────────────────────────────────────────────────────────────

  models: {
    async list(): Promise<HermesModel[]> {
      const result = await getBridge().send<{ models: HermesModel[] }>('listModels')
      return result.models ?? []
    },
  },

  // ── Skills ──────────────────────────────────────────────────────────────

  skills: {
    async list(): Promise<HermesSkill[]> {
      const result = await getBridge().send<{ skills: HermesSkill[] }>('listSkills')
      return result.skills ?? []
    },

    async save(skill: { name: string; category?: string; content: string }): Promise<{ saved: boolean; path: string }> {
      return getBridge().send('saveSkill', skill)
    },

    async delete(skillPath: string): Promise<{ deleted: boolean }> {
      return getBridge().send('deleteSkill', { path: skillPath })
    },
  },

  // ── Memory ──────────────────────────────────────────────────────────────

  memory: {
    async get(): Promise<HermesMemoryFiles> {
      const result = await getBridge().send<{ files: HermesMemoryFiles }>('getMemory')
      return result.files
    },

    async write(filename: string, content: string): Promise<{ written: boolean }> {
      return getBridge().send('writeMemory', { filename, content })
    },
  },

  // ── Tools ───────────────────────────────────────────────────────────────

  tools: {
    async list(): Promise<{ tools: HermesTool[]; enabledToolsets: string[] }> {
      return getBridge().send('listTools')
    },
  },

  // ── Persona ─────────────────────────────────────────────────────────────

  persona: {
    async get(): Promise<{ content: string; path: string }> {
      return getBridge().send('getPersona')
    },

    async update(content: string): Promise<{ written: boolean }> {
      return getBridge().send('updatePersona', { content })
    },
  },

  // ── Workspaces ──────────────────────────────────────────────────────────

  workspaces: {
    async list(): Promise<string[]> {
      const result = await getBridge().send<{ workspaces: string[] }>('listWorkspaces')
      return result.workspaces ?? []
    },
  },
}
