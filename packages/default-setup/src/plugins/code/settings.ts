export default {
  plugins: {
    _meta: { visibility: { code: true } },
    code: {
      hotkeys: {
        openTerminal: { key: '`', modifiers: ['ctrl'] },
        openTerminalTab: { key: '`', modifiers: ['ctrl', 'shift'] },
        navigatePrevPanel: { key: '[', modifiers: ['cmd', 'shift'] },
        navigateNextPanel: { key: ']', modifiers: ['cmd', 'shift'] },
        focusSearch: { key: 'f', modifiers: ['cmd', 'shift'] },
        quickOpen: { key: 'p', modifiers: ['cmd'] },
        saveFile: { key: 's', modifiers: ['cmd'] },
        closeTab: { key: 'w', modifiers: ['cmd'] },
      },
      restoreTerminals: true,
      defaultBaseDirectory: null,
      baseDirectory: null,
      enableShellIntegration: false,
      confirmTerminalClose: true,
      closeTerminalOnTabClose: true,
      maxTerminals: 25,
      mdEditorDefault: true,
      enablePreview: true,
      autoFetchRemote: false,
      autoFetchIntervalSeconds: 180,
      terminalScripts: [
        { id: 'ts_default_0', label: 'Start', command: 'npm start' },
        { id: 'ts_default_1', label: 'Dev', command: 'npm run dev' },
        { id: 'ts_default_2', label: 'Build', command: 'npm run build' },
        { id: 'ts_default_3', label: 'Test', command: 'npm test' },
      ],
      showStashes: true,
      showCommits: true,
      showWorktrees: false,
    }
  }
}
