import { PACK_ID_PATTERN, HOST_PACK_ID } from '@apackdev/sdk/ids';
import { parseStorageProfile, targetDataContext, profileLabel } from '../utils';
import { installPackSource } from './pack-install';

export async function replace(args: string[]): Promise<void> {
  const { env, profile, args: rest } = parseStorageProfile(args);
  const [id, source] = rest;
  if (rest.length !== 2 || !id || !PACK_ID_PATTERN.test(id) || id === HOST_PACK_ID || !source || source.startsWith('-')) {
    throw new Error('Usage: apack pack replace <id> <source> [--profile <name>]');
  }
  const { result } = await installPackSource(targetDataContext(env, profile), source, { kind: 'replace', id });
  console.log(`Replaced "${result.name}" with v${result.version}${profileLabel(env, profile)}; updates are user-managed.`);
  if (result.missingDependencies.length) console.warn(`Missing dependencies: ${result.missingDependencies.join(', ')}`);
  console.log('Open apack to load the replacement.');
}
