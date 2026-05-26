export const filmHomeDirectory = '/Users/spankyed';

export function homePath(path: string) {
  return `${filmHomeDirectory}/${path.replace(/^\/+/, '')}`;
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
