import { z } from 'zod';
import { defineFeatureSettings } from '@apackdev/sdk/framework';
import { hotkeysSchema } from '../../app-settings/schema.ts';

export default defineFeatureSettings({
  visible: true,
  schema: z
    .object({
      hotkeys: hotkeysSchema.default({
        openTerminal: {
          key: '`',
          modifiers: ['ctrl'],
        },
        openTerminalTab: {
          key: '`',
          modifiers: ['ctrl', 'shift'],
        },
        navigatePrevPanel: {
          key: '[',
          modifiers: ['cmd', 'shift'],
        },
        navigateNextPanel: {
          key: ']',
          modifiers: ['cmd', 'shift'],
        },
        focusSearch: {
          key: 'f',
          modifiers: ['cmd', 'shift'],
        },
        quickOpen: {
          key: 'p',
          modifiers: ['cmd'],
        },
        saveFile: {
          key: 's',
          modifiers: ['cmd'],
        },
        closeTab: {
          key: 'w',
          modifiers: ['cmd'],
        },
      }),
      restoreTerminals: z.boolean().default(true),
      defaultBaseDirectory: z.string().nullable().default(null),
      baseDirectory: z.string().nullable().default(null),
      enableShellIntegration: z.boolean().default(false),
      confirmTerminalClose: z.boolean().default(true),
      closeTerminalOnTabClose: z.boolean().default(true),
      maxTerminals: z.number().int().nonnegative().default(25),
      mdEditorDefault: z.boolean().default(true),
      enablePreview: z.boolean().default(true),
      autoFetchRemote: z.boolean().default(false),
      autoFetchIntervalSeconds: z.number().int().min(60).default(180),
      terminalScripts: z
        .array(
          z
            .object({
              id: z.string(),
              label: z.string(),
              command: z.string(),
            })
            .strict()
        )
        .default([
          {
            id: 'ts_default_1',
            label: 'Dev',
            command: 'npm run dev',
          },
          {
            id: 'ts_default_2',
            label: 'Build',
            command: 'npm run build',
          },
          {
            id: 'ts_default_3',
            label: 'Test',
            command: 'npm test',
          },
        ]),
      showStashes: z.boolean().default(true),
      showCommits: z.boolean().default(true),
      showWorktrees: z.boolean().default(false),
      cliPaths: z.record(z.string()).default({}),
    })
    .strict(),
});
