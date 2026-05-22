import { loggerAction, loggerService } from './logger';
import * as llm from './llm';
import * as emitter from './event-emitter';
import * as database from './database';
import { promptService } from './prompt';
import { actionService } from './action';
import { libraryService } from './library';
import * as browser from './browser';
import { repositoryService } from './repository';
import { settingsService } from './settings';
import { createTextStreamService } from './text-stream';
import * as chat from './chat';
import * as artifact from './artifact';
import * as brain from './brain';
import * as media from './media';
import { cliService } from './cli';
import { filesystemService } from './filesystem';
import * as threads from './threads';
import { codexService } from './codex';
import { modelClientService } from './model-client';
import { openaiAuthService } from './openai-auth';

const services = {
  logger: loggerService,
  llm,
  emitter,
  database,
  prompt: promptService,
  action: actionService,
  library: libraryService,
  browser,
  repository: repositoryService,
  settings: settingsService,
  textStream: createTextStreamService(),
  chat,
  artifact,
  brain,
  media,
  cli: cliService,
  filesystem: filesystemService,
  threads,
  codex: codexService,
  modelClient: modelClientService,
  openaiAuth: openaiAuthService,
}

export default services;

// Re-export user services merge for action execution
export { getServicesWithUser, invalidateServiceCache } from '@/core/framework/user-services';
