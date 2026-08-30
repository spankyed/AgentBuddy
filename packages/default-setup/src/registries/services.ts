import * as llm from '../shared/services/llm';
import * as database from '../features/database/be/services/database';
import { promptService } from '../features/prompts/be/services/prompt';
import { actionService } from '../features/actions/be/services/action';
import { libraryService } from '../features/library/be/services/library';
import * as browser from '../features/browser/be/services/browser';
import { settingsService } from '../features/settings/be/services/settings';
import { createTextStreamService } from '../shared/services/text-stream';
import * as chat from '../features/threads/be/services/chat';
import * as artifact from '../features/threads/be/services/artifact';
import * as brain from '../features/brain/be/services/brain';
import * as media from '../shared/services/media';
import { cliService } from '../features/code/be/services/cli';
import { filesystemService } from '../shared/services/filesystem';
import * as threads from '../features/threads/be/services/threads';
import { codexService } from '../features/code/be/services/codex';
import { modelClientService } from '../shared/services/model-client';
import { openaiAuthService } from '../shared/services/openai-auth';

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
  media,
  cli: cliService,
  filesystem: filesystemService,
  threads,
  codex: codexService,
  modelClient: modelClientService,
  openaiAuth: openaiAuthService,
};
