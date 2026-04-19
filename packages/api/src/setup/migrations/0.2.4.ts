import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.4',
  description: 'Update Plan phase default color from blue to orange',
  up: () => {
    const data = settingsQueries.getSettings();
    const modes = data.plugins?.threads?.chat?.modes;
    if (!modes) return;

    const workMode = modes.find((m: any) => m.id === 'work');
    if (!workMode?.phases) return;

    const planPhase = workMode.phases.find((p: any) => p.id === 'plan');
    if (planPhase && planPhase.color === '#3B82F6') {
      planPhase.color = '#F97316';
      settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], modes);
    }
  }
};
