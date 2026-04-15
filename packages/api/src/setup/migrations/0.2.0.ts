import { settingsQueries, settingsCommands } from '@/systems/settings/repository';
import type { Migration } from './index';

export const migration: Migration = {
  target: '0.2.0',
  description: 'Add claude-session tag, replace chat/note modes with manager mode',
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
      { id: 'idle',    label: 'Idle',    color: '#6B7280', colorful: false },
      { id: 'working', label: 'Working', color: '#FACC15', colorful: true },
      { id: 'paused',  label: 'Paused',  color: '#F59E0B', colorful: false },
      { id: 'error',   label: 'Error',   color: '#EF4444', colorful: false },
      { id: 'success', label: 'Success', color: '#10B981', colorful: false },
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

    // 4. Remove review phase from work mode
    const workMode = modes.find(m => m.id === 'work');
    if (workMode?.phases) {
      const reviewIdx = workMode.phases.findIndex((p: any) => p.id === 'review');
      if (reviewIdx !== -1) {
        workMode.phases.splice(reviewIdx, 1);
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
  },
};
