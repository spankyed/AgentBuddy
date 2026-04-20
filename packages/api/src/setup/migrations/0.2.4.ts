import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.4',
  description: 'Update Plan phase color; backfill recentThreadsSortOrder default; add closeTab hotkey',
  up: () => {
    const data = settingsQueries.getSettings();

    // 1. Update Plan phase default color from blue to orange
    const modes = data.plugins?.threads?.chat?.modes;
    if (modes) {
      const workMode = modes.find((m: any) => m.id === 'work');
      if (workMode?.phases) {
        const planPhase = workMode.phases.find((p: any) => p.id === 'plan');
        if (planPhase && planPhase.color === '#3B82F6') {
          planPhase.color = '#F97316';
          settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], modes);
        }
      }
    }

    // 2. Backfill recentThreadsSortOrder if missing
    const threads = data.plugins?.threads;
    if (threads && !threads.recentThreadsSortOrder) {
      settingsCommands.updateSettings('plugin', 'threads', ['recentThreadsSortOrder'], 'created');
    }

    // 3. Add closeTab hotkey to threads chat settings
    const hotkeys = data.plugins?.threads?.chat?.hotkeys;
    if (hotkeys && !hotkeys.closeTab) {
      settingsCommands.updateSettings('plugin', 'threads', ['chat', 'hotkeys', 'closeTab'], { key: 'w', modifiers: ['cmd'] });
    }
  }
};
