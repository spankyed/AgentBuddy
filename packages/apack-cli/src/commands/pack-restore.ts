import { readSettingsOverrides } from '@apackdev/host/database';
import { PACK_ID_PATTERN, HOST_PACK_ID } from '@apackdev/sdk/ids';
import { readHostCompatibility, readInstalledPacks, restoreShippedPack, readAppPackSources } from '@apackdev/host/packs';
import { cliDirs, selectedHostPackages, parseHostFlags } from '../app/pack-host';
import { withPackMutation } from '../app/pack-mutation';
import { parseStorageProfile, targetDataContext, profileLabel } from '../utils';

export async function restore(args: string[]): Promise<void> {
  const { env, profile, args: rest } = parseStorageProfile(args);
  const flags = parseHostFlags(rest);
  const id = flags.args[0];
  if (flags.args.length !== 1 || !id || !PACK_ID_PATTERN.test(id) || id === HOST_PACK_ID || flags.release || flags.prebuilt) {
    throw new Error('Usage: apack pack restore <id> --host <path|beta> [--profile <name>]');
  }
  const host = await selectedHostPackages(flags.host, cliDirs());
  const catalog = readAppPackSources(host.dir);
  const problems = catalog.problems.filter(problem => problem.id === id);
  if (problems.length) throw new Error(`${host.label} cannot supply "${id}": ${problems.map(problem => problem.message).join('; ')}`);
  const sources = catalog.sources.filter(source => source.id === id);
  if (sources.length !== 1) throw new Error(`${host.label} must ship exactly one pack "${id}"; found ${sources.length}.`);
  const context = targetDataContext(env, profile);
  const result = await withPackMutation(context, 'restore', async () => {
    readInstalledPacks(context.installedPacksFile, { strict: true });
    const { version: hostVersion, packFormat } = readHostCompatibility(context.userDataDir);
    return restoreShippedPack(id, sources[0]!.dir, context.packsDir, {
      installedPacksFile: context.installedPacksFile, hostVersion, packFormat,
      settingsOverrides: () => readSettingsOverrides(context.userDataDir),
      expectedSourceRevision: sources[0]!.sourceRevision,
    });
  });
  console.log(`Restored "${result.name}" v${result.version}${profileLabel(env, profile)}; updates follow the app.`);
  console.log('Open apack to load the restored pack.');
}
