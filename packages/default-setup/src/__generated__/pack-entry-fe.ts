// @generated from abuddy.json — do not edit by hand
// Regenerate: node scripts/generate-entries.js

import { registerPackFE } from '@abuddy/sdk/fe/contributions';
import Threads from '../features/threads/fe/plugin';
import Code from '../features/code/fe/plugin';
import Notes from '../features/notes/fe/plugin';
import Calendar from '../features/calendar/fe/plugin';
import Browser from '../features/browser/fe/plugin';
import Library from '../features/library/fe/plugin';
import Flows from '../features/flows/fe/plugin';
import Actions from '../features/actions/fe/plugin';
import Prompts from '../features/prompts/fe/plugin';
import Brain from '../features/brain/fe/plugin';
import Database from '../features/database/fe/plugin';
import Logs from '../features/logs/fe/plugin';
import Settings from '../features/settings/fe/plugin';
import { tiptapPlugins } from '../extensions/tiptap-plugins';
import { artifactDefinitions } from '../extensions/artifacts/register-fe';
import { blockDefinitions } from '../extensions/blocks/register-fe';
import { standardStepsFE } from '../extensions/steps/register-fe';
import Welcome from '../extensions/Welcome.vue';

registerPackFE({
  plugins: [Threads, Code, Notes, Calendar, Browser, Library, Flows, Actions, Prompts, Brain, Database, Logs, Settings],
  defaultPlugin: Threads,
  steps: standardStepsFE,
  tiptapPlugins,
  appExtensions: { welcome: Welcome },
  artifacts: artifactDefinitions,
  blocks: blockDefinitions,
});
