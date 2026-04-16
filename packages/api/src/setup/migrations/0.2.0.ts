import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.0',
  description: 'Add claude-session tag, replace chat/note modes with manager mode, backfill recentThreadsLimit, seed default mode/phase, backfill recordingLimitMinutes',
  up: () => {
    const data = settingsQueries.getSettings();

    // 1. Add claude-session tag if missing
    const tags: Array<{ name: string; color: string }> = data.plugins?.threads?.tags ?? [];
    if (!tags.some(t => t.name === 'claude-session')) {
      settingsCommands.updateSettings(
        'plugin', 'threads', ['tags'],
        [...tags, { name: 'claude-session', color: '#7C3AED' }],
      );
    }

    // 2. Migrate modes: add manager, remove chat and note
    // Old default: [birth, chat, work, note]
    // New default: [birth, manager, work]
    const modes: Array<{ id: string; [k: string]: any }> =
      (data.plugins as any)?.threads?.chat?.modes ?? [];

    let changed = false;

    // Add manager mode before work if missing
    if (!modes.some(m => m.id === 'manager')) {
      const workIdx = modes.findIndex(m => m.id === 'work');
      const insertAt = workIdx !== -1 ? workIdx : modes.length;
      modes.splice(insertAt, 0, { id: 'manager', name: 'Manager', description: 'Delegate tasks and coordinate agents' });
      changed = true;
    }

    // Remove chat and note modes
    const removeIds = ['chat', 'note'];
    for (const id of removeIds) {
      const idx = modes.findIndex(m => m.id === id);
      if (idx !== -1) {
        modes.splice(idx, 1);
        changed = true;
      }
    }

    if (changed) {
      settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], modes);
    }

    // 3. Ensure chatStates config has all required entries
    const chatStates: Array<{ id: string; [k: string]: any }> =
      data.plugins?.threads?.chatStates ?? [];

    const requiredEntries = [
      { id: 'idle',    label: 'Idle',    color: '#6B7280', busy: false },
      { id: 'working', label: 'Working', color: '#FACC15', busy: true },
      { id: 'paused',  label: 'Paused',  color: '#F59E0B', busy: false },
      { id: 'error',   label: 'Error',   color: '#EF4444', busy: false },
      { id: 'success', label: 'Success', color: '#10B981', busy: false },
    ];

    let chatStatesChanged = false;
    for (const entry of requiredEntries) {
      if (!chatStates.some(s => s.id === entry.id)) {
        chatStates.push(entry);
        chatStatesChanged = true;
      }
    }
    if (chatStatesChanged) {
      settingsCommands.updateSettings('plugin', 'threads', ['chatStates'], chatStates);
    }

    // 4. Remove review phase from work mode, backfill default colors on plan/edit phases
    const workMode = modes.find(m => m.id === 'work');
    if (workMode?.phases) {
      let workPhasesChanged = false;
      const reviewIdx = workMode.phases.findIndex((p: any) => p.id === 'review');
      if (reviewIdx !== -1) {
        workMode.phases.splice(reviewIdx, 1);
        workPhasesChanged = true;
      }

      // Backfill default phase colors (added in 0.2.0). Only sets when color is absent
      // so existing user customization is preserved.
      const defaultColors: Record<string, string> = { plan: '#3B82F6', edit: '#6B7280' };
      for (const phase of workMode.phases as Array<{ id: string; color?: string }>) {
        if (!phase.color && defaultColors[phase.id]) {
          phase.color = defaultColors[phase.id];
          workPhasesChanged = true;
        }
      }

      if (workPhasesChanged) {
        settingsCommands.updateSettings('plugin', 'threads', ['chat', 'modes'], modes);
      }
    }

    // 5. Add maxTerminals default to code settings
    const codeSettings = data.plugins?.code;
    if (codeSettings && codeSettings.maxTerminals === undefined) {
      settingsCommands.updateSettings('plugin', 'code', ['maxTerminals'], 25);
    }

    // 6. Rename general.misc → general.application and move hotkeys into application
    const general = data.general;
    const existingApp = (general as any)?.application ?? (general as any)?.app ?? (general as any)?.misc ?? {};
    const hotkeys = (general as any)?.hotkeys;

    if (hotkeys && !existingApp.hotkeys) {
      existingApp.hotkeys = hotkeys;
    }

    settingsCommands.updateSettings('general', 'application', [], existingApp);

    // 7. Backfill recentThreadsLimit default (introduced in 0.2.0)
    if (data.plugins?.threads?.recentThreadsLimit === undefined) {
      settingsCommands.updateSettings('plugin', 'threads', ['recentThreadsLimit'], 7);
    }

    // 7b. Backfill recordingLimitMinutes default (introduced in 0.2.0)
    if (data.plugins?.threads?.recordingLimitMinutes === undefined) {
      settingsCommands.updateSettings('plugin', 'threads', ['recordingLimitMinutes'], 3);
    }

    // 8. Seed default mode/phase for "New Thread" (introduced in 0.2.0).
    // Only set when absent so existing user customization is preserved.
    const chat = (data.plugins as any)?.threads?.chat ?? {};
    if (chat.defaultMode === undefined) {
      settingsCommands.updateSettings('plugin', 'threads', ['chat', 'defaultMode'], 'work');
    }
    if (chat.defaultPhase === undefined) {
      settingsCommands.updateSettings('plugin', 'threads', ['chat', 'defaultPhase'], 'plan');
    }
  },
};
