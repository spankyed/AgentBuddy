import { packUpdates } from '../app/pack-updates';
import { parseStorageProfile, targetDataContext } from '../utils';

export async function outdated(args: string[]): Promise<void> {
  const { env, profile, args: rest } = parseStorageProfile(args);
  if (rest.some(arg => arg !== '--json') || rest.length > 1) throw new Error('Usage: apack pack outdated [--profile <name>] [--json]');
  const results = await packUpdates(targetDataContext(env, profile));
  if (rest.includes('--json')) console.log(JSON.stringify({ packs: results }));
  else if (!results.length) console.log('No packs installed.');
  else for (const row of results) console.log(`${row.id} ${row.currentVersion}: ${row.status}${row.candidate ? ` → ${row.candidate.version}` : ''}${row.reason ? ` (${row.reason})` : ''}`);
  if (results.some(row => row.status === 'error')) throw new Error('Some pack update checks failed.');
}
