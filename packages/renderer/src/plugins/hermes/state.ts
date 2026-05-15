import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import { TRAIL_CLICK } from '@/core/actors/route-trailer'
import { trpc } from '@/core/trpc'

export const id = 'hermes' as const
export type HermesPluginState = ActorRefFrom<typeof hermesState>

export type HermesView = 'agents' | 'skills' | 'persona' | 'memory' | 'tools' | 'settings'

export interface HermesSkill {
  name: string
  category: string
  path: string
  content: string
}

export interface HermesModel {
  name: string
  provider: string
  model: string
}

export interface HermesTool {
  name: string
  enabled: boolean
  description: string
}

export interface HermesContext {
  activeView: HermesView
  connectionStatus: 'disconnected' | 'connected' | 'error'
  agentDir: string | null
  skills: HermesSkill[]
  models: HermesModel[]
  tools: HermesTool[]
  enabledToolsets: string[]
  persona: string
  personaPath: string
  memory: Record<string, string>
  workspaces: string[]
  error: string | null
}

// ─── Events ───────────────────────────────────────────────────────────────

type UIEvent =
  | { type: 'VIEW.SELECT'; view: HermesView }
  | { type: 'SKILL.SAVE'; name: string; category?: string; content: string }
  | { type: 'SKILL.DELETE'; path: string }
  | { type: 'PERSONA.UPDATE'; content: string }
  | { type: 'MEMORY.WRITE'; filename: string; content: string }
  | { type: 'BRIDGE.START' }
  | { type: 'BRIDGE.STOP' }
  | { type: 'BRIDGE.CHECK' }
  | { type: 'REFRESH' }

type SystemEvent =
  | { type: 'HERMES_CONNECTED'; data: any }
  | { type: 'HERMES_BRIDGE_STATUS'; bridge: any }
  | { type: 'HERMES_SKILLS_DATA'; skills: HermesSkill[] }
  | { type: 'HERMES_SKILL_SAVED'; saved: boolean; path: string }
  | { type: 'HERMES_SKILL_DELETED'; deleted: boolean }
  | { type: 'HERMES_PERSONA_DATA'; content: string; path: string }
  | { type: 'HERMES_PERSONA_UPDATED'; written: boolean }
  | { type: 'HERMES_MEMORY_DATA'; files: Record<string, string> }
  | { type: 'HERMES_MEMORY_WRITTEN'; written: boolean; filename: string }
  | { type: 'HERMES_TOOLS_DATA'; tools: HermesTool[]; enabledToolsets: string[] }
  | { type: 'HERMES_MODELS_DATA'; models: HermesModel[] }
  | { type: 'HERMES_WORKSPACES_DATA'; workspaces: string[] }
  | { type: 'HERMES_ERROR'; message: string; method: string }

type HermesEvent = UIEvent | SystemEvent | { type: 'CLIENT_CONNECTED' }

// ─── Machine ──────────────────────────────────────────────────────────────

const hermesState = setup({
  types: {
    context: {} as HermesContext,
    events: {} as HermesEvent,
  },
  actions: {
    selectView: assign({
      activeView: ({ event }) => (event as { type: 'VIEW.SELECT'; view: HermesView }).view,
    }),

    setConnectedData: assign(({ event }) => {
      const ev = event as SystemEvent & { type: 'HERMES_CONNECTED' }
      const data = ev.data
      return {
        connectionStatus: data.bridge?.status === 'ready' ? 'connected' as const : 'disconnected' as const,
        agentDir: data.bridge?.agentDir ?? null,
        skills: data.skills ?? [],
        models: data.models ?? [],
        tools: data.tools?.tools ?? [],
        enabledToolsets: data.tools?.enabledToolsets ?? [],
        persona: data.persona?.content ?? '',
        personaPath: data.persona?.path ?? '',
        memory: data.memory ?? {},
        workspaces: data.workspaces ?? [],
      }
    }),

    updateBridgeStatus: assign(({ event }) => {
      const ev = event as SystemEvent & { type: 'HERMES_BRIDGE_STATUS' }
      return {
        connectionStatus: ev.bridge?.status === 'ready' ? 'connected' as const : 'disconnected' as const,
        agentDir: ev.bridge?.agentDir ?? null,
      }
    }),

    setSkills: assign({
      skills: ({ event }) => (event as SystemEvent & { type: 'HERMES_SKILLS_DATA' }).skills,
    }),

    setPersona: assign(({ event }) => {
      const ev = event as SystemEvent & { type: 'HERMES_PERSONA_DATA' }
      return { persona: ev.content, personaPath: ev.path }
    }),

    setMemory: assign({
      memory: ({ event }) => (event as SystemEvent & { type: 'HERMES_MEMORY_DATA' }).files,
    }),

    setTools: assign(({ event }) => {
      const ev = event as SystemEvent & { type: 'HERMES_TOOLS_DATA' }
      return { tools: ev.tools, enabledToolsets: ev.enabledToolsets }
    }),

    setModels: assign({
      models: ({ event }) => (event as SystemEvent & { type: 'HERMES_MODELS_DATA' }).models,
    }),

    setWorkspaces: assign({
      workspaces: ({ event }) => (event as SystemEvent & { type: 'HERMES_WORKSPACES_DATA' }).workspaces,
    }),

    setError: assign({
      error: ({ event }) => (event as SystemEvent & { type: 'HERMES_ERROR' }).message,
    }),

    // ─── Backend commands ───────────────────────────────────────

    sendStartBridge: () => {
      trpc.bus.send.mutate({ systemId: id, type: 'HERMES_START_BRIDGE' })
    },

    sendStopBridge: () => {
      trpc.bus.send.mutate({ systemId: id, type: 'HERMES_STOP_BRIDGE' })
    },

    sendCheckConnection: () => {
      trpc.bus.send.mutate({ systemId: id, type: 'HERMES_CHECK_CONNECTION' })
    },

    sendSaveSkill: ({ event }) => {
      const ev = event as UIEvent & { type: 'SKILL.SAVE' }
      trpc.bus.send.mutate({
        systemId: id,
        type: 'HERMES_SAVE_SKILL',
        name: ev.name,
        category: ev.category,
        content: ev.content,
      })
    },

    sendDeleteSkill: ({ event }) => {
      const ev = event as UIEvent & { type: 'SKILL.DELETE' }
      trpc.bus.send.mutate({
        systemId: id,
        type: 'HERMES_DELETE_SKILL',
        path: ev.path,
      })
    },

    sendUpdatePersona: ({ event }) => {
      const ev = event as UIEvent & { type: 'PERSONA.UPDATE' }
      trpc.bus.send.mutate({
        systemId: id,
        type: 'HERMES_UPDATE_PERSONA',
        content: ev.content,
      })
    },

    sendWriteMemory: ({ event }) => {
      const ev = event as UIEvent & { type: 'MEMORY.WRITE' }
      trpc.bus.send.mutate({
        systemId: id,
        type: 'HERMES_WRITE_MEMORY',
        filename: ev.filename,
        content: ev.content,
      })
    },

    refreshAll: () => {
      trpc.bus.send.mutate({ systemId: id, type: 'HERMES_GET_SKILLS' })
      trpc.bus.send.mutate({ systemId: id, type: 'HERMES_GET_PERSONA' })
      trpc.bus.send.mutate({ systemId: id, type: 'HERMES_GET_MEMORY' })
      trpc.bus.send.mutate({ systemId: id, type: 'HERMES_GET_TOOLS' })
      trpc.bus.send.mutate({ systemId: id, type: 'HERMES_GET_MODELS' })
      trpc.bus.send.mutate({ systemId: id, type: 'HERMES_GET_WORKSPACES' })
    },
  },
}).createMachine({
  id,
  initial: 'ready',
  context: () => ({
    activeView: 'skills' as HermesView,
    connectionStatus: 'disconnected' as const,
    agentDir: null,
    skills: [],
    models: [],
    tools: [],
    enabledToolsets: [],
    persona: '',
    personaPath: '',
    memory: {},
    workspaces: [],
    error: null,
  }),
  on: {
    // System events (from backend)
    HERMES_CONNECTED: { actions: 'setConnectedData' },
    HERMES_BRIDGE_STATUS: { actions: 'updateBridgeStatus' },
    HERMES_SKILLS_DATA: { actions: 'setSkills' },
    HERMES_SKILL_SAVED: { actions: 'refreshAll' },
    HERMES_SKILL_DELETED: { actions: 'refreshAll' },
    HERMES_PERSONA_DATA: { actions: 'setPersona' },
    HERMES_PERSONA_UPDATED: { actions: 'refreshAll' },
    HERMES_MEMORY_DATA: { actions: 'setMemory' },
    HERMES_MEMORY_WRITTEN: { actions: 'refreshAll' },
    HERMES_TOOLS_DATA: { actions: 'setTools' },
    HERMES_MODELS_DATA: { actions: 'setModels' },
    HERMES_WORKSPACES_DATA: { actions: 'setWorkspaces' },
    HERMES_ERROR: { actions: 'setError' },

    // UI events
    'VIEW.SELECT': { actions: 'selectView' },
    'SKILL.SAVE': { actions: 'sendSaveSkill' },
    'SKILL.DELETE': { actions: 'sendDeleteSkill' },
    'PERSONA.UPDATE': { actions: 'sendUpdatePersona' },
    'MEMORY.WRITE': { actions: 'sendWriteMemory' },
    'BRIDGE.START': { actions: 'sendStartBridge' },
    'BRIDGE.STOP': { actions: 'sendStopBridge' },
    'BRIDGE.CHECK': { actions: 'sendCheckConnection' },
    REFRESH: { actions: 'refreshAll' },
  },
  states: {
    ready: {
      meta: breadcrumb('ready', 'Hermes', true),
      on: {
        ...TRAIL_CLICK([
          ['.ready', 'ready'],
        ]),
      },
    },
  },
})

export default hermesState
