import type { TerminalInfo } from '../state';

interface FileTab {
  path: string;
  content: string;
  modified: boolean;
  isTerminal?: boolean;
  terminalInfo?: TerminalInfo;
}

export function mergeTerminalTabs(
  openFiles: FileTab[],              // existing tabs in parent
  terminals: TerminalInfo[],         // terminals to open
  currentActive?: string | null      // parent.activeFilePath
): { openFiles: FileTab[]; activeFilePath: string | null } {
  const nextTabs = terminals.map(t => ({
    path: `terminal:${t.id}`,
    content: '',
    modified: false,
    isTerminal: true,
    terminalInfo: t
  }));

  // de-dupe
  const pathsToAdd = new Set(nextTabs.map(t => t.path));
  const kept = openFiles.filter(f => !pathsToAdd.has(f.path));

  return {
    openFiles: [...kept, ...nextTabs],
    activeFilePath: currentActive ?? nextTabs[0]?.path ?? null
  };
}