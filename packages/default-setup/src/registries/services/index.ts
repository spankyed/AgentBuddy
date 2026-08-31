import * as llm from '../../plugins/brain/be/services/llm';
import * as database from '../../plugins/database/be/services/database';
import { promptService } from '../../plugins/prompts/be/services/prompt';
import { actionService } from '../../plugins/actions/be/services/action';
import { libraryService } from '../../plugins/library/be/services/library';
import * as browser from '../../plugins/browser/be/services/browser';
import { settingsService } from '../../plugins/settings/be/services/settings';
import { createTextStreamService } from './text-stream';
import * as chat from '../../plugins/threads/be/services/chat';
import * as artifact from '../../plugins/threads/be/services/artifact';
import * as brain from '../../plugins/brain/be/services/brain';
import { cliService } from '../../plugins/code/be/services/cli';
import { filesystemService } from './filesystem';
import * as threads from '../../plugins/threads/be/services/threads';
import { codexService } from '../../plugins/code/be/services/codex';
import { modelClientService } from './model-client';
import { openaiAuthService } from './openai-auth';

export const featureServices = {
  llm,
  database,
  prompt: promptService,
  action: actionService,
  library: libraryService,
  browser,
  settings: settingsService,
  textStream: createTextStreamService(),
  chat,
  artifact,
  brain,
  cli: cliService,
  filesystem: filesystemService,
  threads,
  codex: codexService,
  modelClient: modelClientService,
  openaiAuth: openaiAuthService,
};
