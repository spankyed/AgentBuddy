const ENTITIES: Record<string, () => Promise<(args: string[], root: string) => Promise<void>>> = {
  'feature':    async () => (await import('./add/feature')).addFeature,
  'step':       async () => (await import('./add/step')).addStep,
  'artifact':   async () => (await import('./add/artifact')).addArtifact,
  'block':      async () => (await import('./add/block')).addBlock,
  'action':     async () => (await import('./add/action')).addAction,
  'prompt':     async () => (await import('./add/prompt')).addPrompt,
  'flow':       async () => (await import('./add/flow')).addFlow,
  'service':    async () => (await import('./add/service')).addService,
  'migration':  async () => (await import('./add/migration')).addMigration,
};

const USAGE = `
Usage: abuddy add <entity> <name> [options]

Entities:
  feature <name>     Full feature (system + plugin)
  step <type>        Flow step definition
  artifact <type>    Artifact viewer
  block <type>       Message block component
  action <name>      Action seed
  prompt <name>      Prompt seed
  flow <name>        Flow seed
  service <name>     Service module
  migration          Version-targeted migration

Options vary by entity. Run "abuddy add <entity> --help" for details.
`.trim();

import { findPackRoot } from '../utils';

export async function add(args: string[]) {
  const entity = args[0];

  if (!entity || entity === '--help' || entity === '-h') {
    console.log(USAGE);
    return;
  }

  const loader = ENTITIES[entity];
  if (!loader) {
    console.error(`Unknown entity: ${entity}`);
    console.log(USAGE);
    process.exit(1);
  }

  const root = findPackRoot(process.cwd());
  const fn = await loader();
  await fn(args.slice(1), root);
}
