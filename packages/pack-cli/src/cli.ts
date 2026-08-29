#!/usr/bin/env node
import { init } from './commands/init';
import { build } from './commands/build';
import { validate } from './commands/validate';
import { dev } from './commands/dev';

const USAGE = `
abuddy - AgentBuddy Pack CLI

Commands:
  init [name]         Scaffold a new pack
  build               Compile pack artifacts to dist/
  validate            Check manifest and types
  dev                 Watch mode for local development

Options:
  --help, -h          Show this help
  --version, -v       Show version
`.trim();

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  if (command === '--version' || command === '-v') {
    console.log('0.1.0');
    process.exit(0);
  }

  try {
    switch (command) {
      case 'init':
        await init(args.slice(1));
        break;
      case 'build':
        await build(args.slice(1));
        break;
      case 'validate':
        await validate(args.slice(1));
        break;
      case 'dev':
        await dev(args.slice(1));
        break;
      default:
        console.error(`Unknown command: ${command}`);
        console.log(USAGE);
        process.exit(1);
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
