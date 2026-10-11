import { appCommand } from '../app/app-command.ts';

export async function install(args: string[]): Promise<void> {
  await appCommand('install', args);
}
