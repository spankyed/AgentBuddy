import Threads from '../features/threads/fe/plugin';
import Flows from '../features/flows/fe/plugin';
import Database from '../features/database/fe/plugin';
import Brain from '../features/brain/fe/plugin';
import Logs from '../features/logs/fe/plugin';
import Prompts from '../features/prompts/fe/plugin';
import Settings from '../features/settings/fe/plugin';
import Actions from '../features/actions/fe/plugin';
import Library from '../features/library/fe/plugin';
import Code from '../features/code/fe/plugin';
import Notes from '../features/notes/fe/plugin';
import Browser from '../features/browser/fe/plugin';
import Calendar from '../features/calendar/fe/plugin';

export const plugins = [
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

export const defaultPlugin = Threads;
