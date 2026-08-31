import { registerPluginDesignations } from '@abuddy/sdk/fe';
import type { Plugin } from '@/core/types';
import Threads from '../plugins/threads/fe/plugin';
import Flows from '../plugins/flows/fe/plugin';
import Database from '../plugins/database/fe/plugin';
import Brain from '../plugins/brain/fe/plugin';
import Logs from '../plugins/logs/fe/plugin';
import Prompts from '../plugins/prompts/fe/plugin';
import Settings from '../plugins/settings/fe/plugin';
import Actions from '../plugins/actions/fe/plugin';
import Library from '../plugins/library/fe/plugin';
import Code from '../plugins/code/fe/plugin';
import Notes from '../plugins/notes/fe/plugin';
import Browser from '../plugins/browser/fe/plugin';
import Calendar from '../plugins/calendar/fe/plugin';

export const plugins: Plugin[] = [
  Threads,
  Code,
  Notes,
  Calendar,
  Browser,
  Library,
  Flows,
  Actions,
  Prompts,
  Brain,
  Database,
  Logs,
  Settings,
];

registerPluginDesignations(plugins);

export const defaultPlugin = Threads;
