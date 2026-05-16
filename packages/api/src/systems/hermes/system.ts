/**
 * Hermes Management System — backend XState machine.
 *
 * Handles CRUD operations for the Hermes management plugin (Skills, Persona,
 * Memory, Tools, Settings). Delegates to the Hermes service for all bridge
 * communication.
 */

import { setup } from 'xstate';
import { defineSystem } from '@/core/framework/define-system';
import { bus } from '@/systems/backend';
import { emit } from '@/core/helpers/actor-helpers';
import { hermes as hermesService } from '@/services/hermes';
import { createLogger } from '@/core/helpers/debug/logger';
import { repository } from '@/repository';
import type { HermesConnectedData, HermesSkill } from './types';

const logger = createLogger('hermes-system');

// ─── Event Types ────────────────────────────────────────────────────────────

type IncomingHermesEvents =
  | { type: 'HERMES_START_BRIDGE' }
  | { type: 'HERMES_STOP_BRIDGE' }
  | { type: 'HERMES_CHECK_CONNECTION' }
  | { type: 'HERMES_GET_SKILLS' }
  | { type: 'HERMES_SAVE_SKILL'; name: string; category?: string; content: string }
  | { type: 'HERMES_DELETE_SKILL'; path: string }
  | { type: 'HERMES_GET_PERSONA' }
  | { type: 'HERMES_UPDATE_PERSONA'; content: string }
  | { type: 'HERMES_GET_MEMORY' }
  | { type: 'HERMES_WRITE_MEMORY'; filename: string; content: string }
  | { type: 'HERMES_GET_TOOLS' }
  | { type: 'HERMES_GET_MODELS' }
  | { type: 'HERMES_GET_WORKSPACES' }
  | { type: 'HERMES_UPDATE_CONFIG'; provider?: string; apiKey?: string; model?: string };

type OutgoingHermesEvents =
  | { type: 'HERMES_CONNECTED'; data: HermesConnectedData }
  | { type: 'HERMES_BRIDGE_STATUS'; bridge: { status: string; agentDir: string | null; pid: number | null; error?: string } }
  | { type: 'HERMES_SKILLS_DATA'; skills: HermesSkill[] }
  | { type: 'HERMES_SKILL_SAVED'; saved: boolean; path: string }
  | { type: 'HERMES_SKILL_DELETED'; deleted: boolean }
  | { type: 'HERMES_PERSONA_DATA'; content: string; path: string }
  | { type: 'HERMES_PERSONA_UPDATED'; written: boolean }
  | { type: 'HERMES_MEMORY_DATA'; files: Record<string, string> }
  | { type: 'HERMES_MEMORY_WRITTEN'; written: boolean; filename: string }
  | { type: 'HERMES_TOOLS_DATA'; tools: Array<{ name: string; enabled: boolean; description: string }>; enabledToolsets: string[] }
  | { type: 'HERMES_MODELS_DATA'; models: Array<{ name: string; provider: string; model: string }> }
  | { type: 'HERMES_WORKSPACES_DATA'; workspaces: string[] }
  | { type: 'HERMES_ERROR'; message: string; method: string };

// ─── System Definition ──────────────────────────────────────────────────────

export const hermesDef = defineSystem('hermes')<IncomingHermesEvents, OutgoingHermesEvents>();
export const hermes = hermesDef.id;

// Helper to send error events
function sendError(system: any, method: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Hermes ${method} failed: ${message}`);
  system.get(bus).send(emit(hermes, {
    type: 'HERMES_ERROR',
    message,
    method,
  }));
}

export const hermesSystem = setup({
  types: hermesDef.types,
  actions: {
    sendConnectedData: ({ system }) => {
      const bridge = hermesService.info;

      if (bridge.status !== 'ready') {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_CONNECTED',
          data: {
            bridge,
            skills: [],
            models: [],
            tools: { tools: [], enabledToolsets: [] },
            persona: { content: '', path: '' },
            memory: { 'MEMORY.md': '', 'USER.md': '', 'SOUL.md': '' },
            workspaces: [],
            sessions: [],
          },
        }));
        return;
      }

      Promise.all([
        hermesService.skills.list().catch(() => [] as HermesSkill[]),
        hermesService.models.list().catch(() => [] as Array<{ name: string; provider: string; model: string }>),
        hermesService.tools.list().catch(() => ({ tools: [] as Array<{ name: string; enabled: boolean; description: string }>, enabledToolsets: [] as string[] })),
        hermesService.persona.get().catch(() => ({ content: '', path: '' })),
        hermesService.memory.get().catch(() => ({ 'MEMORY.md': '', 'USER.md': '', 'SOUL.md': '' } as Record<string, string>)),
        hermesService.workspaces.list().catch(() => [] as string[]),
        hermesService.sessions.list().catch(() => []),
      ]).then(([skills, models, tools, persona, memory, workspaces, sessions]) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_CONNECTED',
          data: { bridge, skills, models, tools, persona, memory, workspaces, sessions } as HermesConnectedData,
        }));
      }).catch((err: unknown) => sendError(system, 'sendConnectedData', err));
    },

    startBridge: ({ system }) => {
      // Read stored config (apiKey, provider, model) and pass to bridge
      const stored = repository.settingsQueries.getPluginSettings('hermes') as any;
      const config = stored?.config ?? {};
      hermesService.start({
        ...(config.apiKey ? { apiKey: config.apiKey } : {}),
        ...(config.provider ? { provider: config.provider } : {}),
        ...(config.model ? { defaultModel: config.model } : {}),
      }).then((info) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_BRIDGE_STATUS',
          bridge: info,
        }));
      }).catch((err: unknown) => sendError(system, 'startBridge', err));
    },

    stopBridge: ({ system }) => {
      hermesService.stop().then(() => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_BRIDGE_STATUS',
          bridge: hermesService.info,
        }));
      }).catch((err: unknown) => sendError(system, 'stopBridge', err));
    },

    checkConnection: ({ system }) => {
      hermesService.health().then((result) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_BRIDGE_STATUS',
          bridge: { ...hermesService.info, ...result },
        }));
      }).catch((err: unknown) => sendError(system, 'checkConnection', err));
    },

    getSkills: ({ system }) => {
      hermesService.skills.list().then((skills) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_SKILLS_DATA',
          skills,
        }));
      }).catch((err: unknown) => sendError(system, 'getSkills', err));
    },

    saveSkill: ({ system, event }) => {
      const ev = hermesDef.typeOf('HERMES_SAVE_SKILL', event);
      hermesService.skills.save({
        name: ev.name,
        category: ev.category,
        content: ev.content,
      }).then((result) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_SKILL_SAVED',
          saved: result.saved,
          path: result.path,
        }));
      }).catch((err: unknown) => sendError(system, 'saveSkill', err));
    },

    deleteSkill: ({ system, event }) => {
      const ev = hermesDef.typeOf('HERMES_DELETE_SKILL', event);
      hermesService.skills.delete(ev.path).then((result) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_SKILL_DELETED',
          deleted: result.deleted,
        }));
      }).catch((err: unknown) => sendError(system, 'deleteSkill', err));
    },

    getPersona: ({ system }) => {
      hermesService.persona.get().then((result) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_PERSONA_DATA',
          content: result.content,
          path: result.path,
        }));
      }).catch((err: unknown) => sendError(system, 'getPersona', err));
    },

    updatePersona: ({ system, event }) => {
      const ev = hermesDef.typeOf('HERMES_UPDATE_PERSONA', event);
      hermesService.persona.update(ev.content).then((result) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_PERSONA_UPDATED',
          written: result.written,
        }));
      }).catch((err: unknown) => sendError(system, 'updatePersona', err));
    },

    getMemory: ({ system }) => {
      hermesService.memory.get().then((files) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_MEMORY_DATA',
          files: files as Record<string, string>,
        }));
      }).catch((err: unknown) => sendError(system, 'getMemory', err));
    },

    writeMemory: ({ system, event }) => {
      const ev = hermesDef.typeOf('HERMES_WRITE_MEMORY', event);
      hermesService.memory.write(ev.filename, ev.content).then((result) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_MEMORY_WRITTEN',
          written: result.written,
          filename: ev.filename,
        }));
      }).catch((err: unknown) => sendError(system, 'writeMemory', err));
    },

    getTools: ({ system }) => {
      hermesService.tools.list().then((result) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_TOOLS_DATA',
          tools: result.tools,
          enabledToolsets: result.enabledToolsets,
        }));
      }).catch((err: unknown) => sendError(system, 'getTools', err));
    },

    getModels: ({ system }) => {
      hermesService.models.list().then((models) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_MODELS_DATA',
          models,
        }));
      }).catch((err: unknown) => sendError(system, 'getModels', err));
    },

    getWorkspaces: ({ system }) => {
      hermesService.workspaces.list().then((workspaces) => {
        system.get(bus).send(emit(hermes, {
          type: 'HERMES_WORKSPACES_DATA',
          workspaces,
        }));
      }).catch((err: unknown) => sendError(system, 'getWorkspaces', err));
    },

    updateConfig: ({ event }) => {
      const ev = hermesDef.typeOf('HERMES_UPDATE_CONFIG', event);
      const current = (repository.settingsQueries.getPluginSettings('hermes') as any)?.config ?? {};
      const next = { ...current };
      if (ev.provider !== undefined) next.provider = ev.provider;
      if (ev.apiKey !== undefined) next.apiKey = ev.apiKey;
      if (ev.model !== undefined) next.model = ev.model;
      repository.settingsCommands.updateSettings('plugin', 'hermes', ['config'], next);
      // Forward to running bridge — hot-updates env + clears agent cache
      hermesService.updateConfig(next).catch(() => {});
    },
  },
}).createMachine({
  id: hermes,
  initial: 'idle',
  context: ({}) => ({}),
  on: {
    HERMES_SAVE_SKILL: { actions: 'saveSkill' },
    HERMES_DELETE_SKILL: { actions: 'deleteSkill' },
    HERMES_UPDATE_PERSONA: { actions: 'updatePersona' },
    HERMES_WRITE_MEMORY: { actions: 'writeMemory' },
    HERMES_UPDATE_CONFIG: { actions: 'updateConfig' },
  },
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: { actions: 'sendConnectedData' },
        HERMES_START_BRIDGE: { actions: 'startBridge' },
        HERMES_STOP_BRIDGE: { actions: 'stopBridge' },
        HERMES_CHECK_CONNECTION: { actions: 'checkConnection' },
        HERMES_GET_SKILLS: { actions: 'getSkills' },
        HERMES_GET_PERSONA: { actions: 'getPersona' },
        HERMES_GET_MEMORY: { actions: 'getMemory' },
        HERMES_GET_TOOLS: { actions: 'getTools' },
        HERMES_GET_MODELS: { actions: 'getModels' },
        HERMES_GET_WORKSPACES: { actions: 'getWorkspaces' },
      },
    },
  },
});
