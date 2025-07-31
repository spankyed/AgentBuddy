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
import { promptQueries, promptCommands } from '@/systems/prompts/repository';
import { terminalQueries, terminalCommands } from '@/systems/code/repository';
import { threadQueries, threadCommands } from '@/systems/threads/repository';

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
  
  // Prompts system
  promptQueries,
  promptCommands,
  
  // Code/Terminal system
  terminalQueries,
  terminalCommands,
  
  // Threads system
  threadQueries,
  threadCommands,
} as const;

// Type export for better IDE support
export type Repository = typeof repository;