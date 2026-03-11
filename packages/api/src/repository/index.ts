/**
 * Central Repository
 * 
 * Single namespace for all repository operations across the application.
 * Access pattern: repository.{system}Queries.{method}() or repository.{system}Commands.{method}()
 */

// Import all system repositories
import { actionQueries, actionCommands } from '@/systems/actions/repository';
import { agentQueries, agentCommands } from '@/systems/agent/repository';
import { brainQueries, brainCommands } from '@/systems/brain/repository';
import { flowsQueries, flowsCommands } from '@/systems/flows/repository';
import { libraryQueries, libraryCommands } from '@/systems/library/repository';
import { promptQueries, promptCommands } from '@/systems/prompts/repository';
import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import { secretsQueries, secretsCommands } from '@/systems/settings/secrets/repository';
import { terminalQueries, terminalCommands } from '@/systems/code/repository';
import { threadQueries, threadCommands } from '@/systems/threads/repository';
import { noteQueries, noteCommands } from '@/systems/notes/repository';

// Export centralized repository
export const repository = {
  // Action system
  actionQueries,
  actionCommands,
  
  // Agent system
  agentQueries,
  agentCommands,
  
  // Brain system
  brainQueries,
  brainCommands,
  
  // Flows system
  flowsQueries,
  flowsCommands,
  
  // Library system
  libraryQueries,
  libraryCommands,
  
  // Prompts system
  promptQueries,
  promptCommands,
  
  // Settings system
  settingsQueries,
  settingsCommands,

  // Secrets system
  secretsQueries,
  secretsCommands,

  // Code/Terminal system
  terminalQueries,
  terminalCommands,

  // Threads system
  threadQueries,
  threadCommands,

  // Notes system
  noteQueries,
  noteCommands,
} as const;

// Type export for better IDE support
export type Repository = typeof repository;