export type FilmPathState = {
  homeDirectory: string;
  homeDisplayName: string;
};

export const filmPathState: FilmPathState = {
  homeDirectory: '~',
  homeDisplayName: '~',
};

export const filmHomeDirectory = filmPathState.homeDirectory;

export function homePath(path: string, state: FilmPathState = filmPathState) {
  return `${state.homeDirectory}/${path.replace(/^\/+/, '')}`;
}

export function displayPath(path: string, state: FilmPathState = filmPathState) {
  const normalizedHome = state.homeDirectory.replace(/\/+$/, '');

  if (!normalizedHome) return path;

  if (path === normalizedHome) {
    return state.homeDisplayName;
  }

  if (path.startsWith(`${normalizedHome}/`)) {
    return `${state.homeDisplayName}${path.slice(normalizedHome.length)}`;
  }

  return path;
}

export const filmProjects = {
  agentBuddy: homePath('Develop/Projects/AgentBuddy'),
  clientlabs: homePath('Develop/Projects/Clientlabs'),
  launch: homePath('Develop/Projects/Launch'),
};

export const filmExportDirectories = {
  actions: homePath('Exports/AgentBuddy Actions'),
  flows: homePath('Exports/AgentBuddy Flows'),
  library: homePath('Exports/AgentBuddy Library'),
  notes: homePath('Exports/AgentBuddy Notes'),
  prompts: homePath('Exports/AgentBuddy Prompts'),
  threads: homePath('Exports/AgentBuddy Threads'),
};

export const filmSetupPackDirectories = {
  launch: homePath('Develop/Setup Packs/agentbuddy-launch'),
  broken: homePath('Develop/Setup Packs/broken-pack'),
};

export const filmDatabaseBackupDirectory = homePath('Documents/AgentBuddy Backups');
