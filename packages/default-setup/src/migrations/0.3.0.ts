import { services } from '@/__generated__/services';
import { repository } from '@/__generated__/repository';
import type { PackMigration } from '@abuddy/sdk/framework';
import { ref } from '@/__generated__/ref';

export const migration: PackMigration = {
  target: '0.3.0',
  description: 'Add codex agent mode if missing; remove the Hermes mode',
  up: () => {
    // The user's own modes, if they stored any: the defaults already have Codex, and patching a merged copy would
    // write every default mode into the user's stored settings. The host's 0.3.15 migration, which runs before every
    // pack migration, has moved them onto the threads plugin's ref, and dropped Hermes's settings, which no plugin owns.
    const stored = (services.settings.getStored().plugins ?? {}) as Record<string, any>;
    const storedModes = stored[ref('threads')]?.chat?.modes;
    const modes: Array<{ id: string; name?: string; description?: string; [k: string]: any }> | undefined =
      storedModes && structuredClone(storedModes);
    if (modes) patchModes(modes);
  },
};

/** Codex added after Hermes (or last) with its phases, or its phases filled in; Hermes removed */
function patchModes(modes: Array<{ id: string; name?: string; description?: string; [k: string]: any }>): void {
  const codexPhases = [
    { id: 'plan', name: 'Plan', description: 'Strategic planning and exploration', color: '#3B82F6' },
    { id: 'default', name: 'Default', description: 'Implementation and development', color: '#6B7280' },
  ];

  if (!modes.some(m => m.id === 'codex')) {
    // Insert after hermes, before manager (or at end if hermes not found)
    const hermesIdx = modes.findIndex(m => m.id === 'hermes');
    const insertAt = hermesIdx !== -1 ? hermesIdx + 1 : modes.length;
    modes.splice(insertAt, 0, {
      id: 'codex',
      name: 'Codex',
      description: 'OpenAI Codex agent mode',
      phases: codexPhases,
    });
  } else {
    // Patch existing codex mode with phases if missing
    const codexMode = modes.find(m => m.id === 'codex');
    if (codexMode && !codexMode.phases) {
      codexMode.phases = codexPhases;
    }
  }

  const nextModes = modes.filter(mode => mode.id !== 'hermes');
  services.settings.setForFeature(ref('threads'), ['chat', 'modes'], nextModes);
}
