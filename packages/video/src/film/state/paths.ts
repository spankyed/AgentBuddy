export type FilmPathState = {
  homeDirectory: string;
  homeDisplayName: string;
  pathAliases?: Array<{
    displayName: string;
    path: string;
  }>;
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
  const aliases = [
    {displayName: state.homeDisplayName, path: state.homeDirectory},
    ...(state.pathAliases ?? []),
  ];

  for (const alias of aliases) {
    const normalizedPath = alias.path.replace(/\/+$/, '');

    if (!normalizedPath) continue;

    if (path === normalizedPath) {
      return alias.displayName;
    }

    if (path.startsWith(`${normalizedPath}/`)) {
      return `${alias.displayName}${path.slice(normalizedPath.length)}`;
    }
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
