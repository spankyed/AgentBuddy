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
import { hermes } from '@/services/hermes';
import { createLogger } from '@/core/helpers/debug/logger';
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
  | { type: 'HERMES_GET_WORKSPACES' };

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
export const hermesId = hermesDef.id;

// Helper to send error events
function sendError(system: any, method: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  logger.error(`Hermes ${method} failed: ${message}`);
  system.get(bus).send(emit(hermesId, {
    type: 'HERMES_ERROR',
    message,
    method,
  }));
}

export const hermesSystem = setup({
  types: hermesDef.types,
  actions: {
    sendConnectedData: ({ system }) => {
      // Attempt to gather all data — if bridge is not running, send what we can
      const bridge = hermes.info;

      if (bridge.status !== 'ready') {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_CONNECTED',
          data: {
            bridge,
            skills: [],
            models: [],
            tools: { tools: [], enabledToolsets: [] },
            persona: { content: '', path: '' },
            memory: { 'MEMORY.md': '', 'USER.md': '', 'SOUL.md': '' },
            workspaces: [],
          },
        }));
        return;
      }

      // Fetch all data in parallel
      Promise.all([
        hermes.skills.list().catch(() => []),
        hermes.models.list().catch(() => []),
        hermes.tools.list().catch(() => ({ tools: [], enabledToolsets: [] })),
        hermes.persona.get().catch(() => ({ content: '', path: '' })),
        hermes.memory.get().catch(() => ({ 'MEMORY.md': '', 'USER.md': '', 'SOUL.md': '' })),
        hermes.workspaces.list().catch(() => []),
      ]).then(([skills, models, tools, persona, memory, workspaces]) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_CONNECTED',
          data: {
            bridge,
            skills: skills as any,
            models: models as any,
            tools: tools as any,
            persona: persona as any,
            memory: memory as any,
            workspaces: workspaces as any,
          },
        }));
      }).catch((err) => sendError(system, 'sendConnectedData', err));
    },

    startBridge: ({ system }) => {
      hermes.start().then((info) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_BRIDGE_STATUS',
          bridge: info,
        }));
      }).catch((err) => sendError(system, 'startBridge', err));
    },

    stopBridge: ({ system }) => {
      hermes.stop().then(() => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_BRIDGE_STATUS',
          bridge: hermes.info,
        }));
      }).catch((err) => sendError(system, 'stopBridge', err));
    },

    checkConnection: ({ system }) => {
      hermes.health().then((result) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_BRIDGE_STATUS',
          bridge: { ...hermes.info, ...result },
        }));
      }).catch((err) => sendError(system, 'checkConnection', err));
    },

    getSkills: ({ system }) => {
      hermes.skills.list().then((skills) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_SKILLS_DATA',
          skills,
        }));
      }).catch((err) => sendError(system, 'getSkills', err));
    },

    saveSkill: ({ system, event }) => {
      const ev = hermesDef.typeOf('HERMES_SAVE_SKILL', event);
      hermes.skills.save({
        name: ev.name,
        category: ev.category,
        content: ev.content,
      }).then((result) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_SKILL_SAVED',
          saved: result.saved,
          path: result.path,
        }));
      }).catch((err) => sendError(system, 'saveSkill', err));
    },

    deleteSkill: ({ system, event }) => {
      const ev = hermesDef.typeOf('HERMES_DELETE_SKILL', event);
      hermes.skills.delete(ev.path).then((result) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_SKILL_DELETED',
          deleted: result.deleted,
        }));
      }).catch((err) => sendError(system, 'deleteSkill', err));
    },

    getPersona: ({ system }) => {
      hermes.persona.get().then((result) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_PERSONA_DATA',
          content: result.content,
          path: result.path,
        }));
      }).catch((err) => sendError(system, 'getPersona', err));
    },

    updatePersona: ({ system, event }) => {
      const ev = hermesDef.typeOf('HERMES_UPDATE_PERSONA', event);
      hermes.persona.update(ev.content).then((result) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_PERSONA_UPDATED',
          written: result.written,
        }));
      }).catch((err) => sendError(system, 'updatePersona', err));
    },

    getMemory: ({ system }) => {
      hermes.memory.get().then((files) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_MEMORY_DATA',
          files: files as any,
        }));
      }).catch((err) => sendError(system, 'getMemory', err));
    },

    writeMemory: ({ system, event }) => {
      const ev = hermesDef.typeOf('HERMES_WRITE_MEMORY', event);
      hermes.memory.write(ev.filename, ev.content).then((result) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_MEMORY_WRITTEN',
          written: result.written,
          filename: ev.filename,
        }));
      }).catch((err) => sendError(system, 'writeMemory', err));
    },

    getTools: ({ system }) => {
      hermes.tools.list().then((result) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_TOOLS_DATA',
          tools: result.tools,
          enabledToolsets: result.enabledToolsets,
        }));
      }).catch((err) => sendError(system, 'getTools', err));
    },

    getModels: ({ system }) => {
      hermes.models.list().then((models) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_MODELS_DATA',
          models,
        }));
      }).catch((err) => sendError(system, 'getModels', err));
    },

    getWorkspaces: ({ system }) => {
      hermes.workspaces.list().then((workspaces) => {
        system.get(bus).send(emit(hermesId, {
          type: 'HERMES_WORKSPACES_DATA',
          workspaces,
        }));
      }).catch((err) => sendError(system, 'getWorkspaces', err));
    },
  },
}).createMachine({
  id: hermesId,
  initial: 'idle',
  context: ({}) => ({}),
  on: {
    HERMES_SAVE_SKILL: { actions: 'saveSkill' },
    HERMES_DELETE_SKILL: { actions: 'deleteSkill' },
    HERMES_UPDATE_PERSONA: { actions: 'updatePersona' },
    HERMES_WRITE_MEMORY: { actions: 'writeMemory' },
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
