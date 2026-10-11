import { appCommand } from '../app/app-command.ts';

export async function upgrade(args: string[]): Promise<void> {
  await appCommand('upgrade', args);
}
