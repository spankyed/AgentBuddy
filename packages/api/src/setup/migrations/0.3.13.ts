import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.3.13',
  description: 'Backfill browser and notes plugin visibility defaults',
  up: () => {
    const data = settingsQueries.getSettings();
    const plugins = (data.plugins as any) ?? {};
    const visibility = plugins._meta?.visibility ?? {};

    const updates: Record<string, boolean> = {};
    if (!Object.prototype.hasOwnProperty.call(visibility, 'browser')) updates.browser = false;
    if (!Object.prototype.hasOwnProperty.call(visibility, 'notes')) updates.notes = false;

    if (Object.keys(updates).length > 0) {
      settingsCommands.updateSettings('plugin', '_meta', ['visibility'], { ...visibility, ...updates });
    }
  },
};
