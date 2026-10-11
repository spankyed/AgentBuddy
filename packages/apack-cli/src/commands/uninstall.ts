import { appCommand } from '../app/app-command.ts';

export async function uninstall(args: string[]): Promise<void> {
  await appCommand('uninstall', args);
}
