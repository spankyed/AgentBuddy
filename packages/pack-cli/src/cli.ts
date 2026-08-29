#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { init } from './commands/init';
import { build } from './commands/build';
import { validate } from './commands/validate';
import { dev } from './commands/dev';
import { install } from './commands/install';

const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf-8'));

const USAGE = `
abuddy - AgentBuddy Pack CLI

Commands:
  init [name]         Scaffold a new pack
  build               Compile pack artifacts to dist/
  validate            Check manifest and types
  install <path>      Install a pack from a directory or .zip
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
    console.log(pkg.version);
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
      case 'install':
        await install(args.slice(1));
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
