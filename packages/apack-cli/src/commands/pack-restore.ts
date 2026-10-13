import * as fs from 'node:fs';
import * as path from 'node:path';
import { PACK_ID_PATTERN, HOST_PACK_ID } from '@apackdev/sdk/ids';
import { readHostCompatibility, readInstalledPacks, restoreShippedPack } from '@apackdev/host/packs';
import { cliDirs, configuredHostPackagesDir, parseHostFlags } from '../app/pack-host';
import { withPackMutation } from '../app/pack-mutation';
import { parseStorageProfile, targetDataContext, profileLabel, readValidManifest } from '../utils';

export async function restore(args: string[]): Promise<void> {
  const { env, profile, args: rest } = parseStorageProfile(args);
  const flags = parseHostFlags(rest);
  const id = flags.args[0];
  if (flags.args.length !== 1 || !id || !PACK_ID_PATTERN.test(id) || id === HOST_PACK_ID || flags.release || flags.prebuilt) {
    throw new Error('Usage: apack pack restore <id> --host <path|beta> [--profile <name>]');
  }
  // An explicit selection wins over a parent process's resolved handoff. Storage never picks a source.
  const sourceEnv = { ...process.env };
  if (flags.host) {
    delete sourceEnv.APACK_HOST_ROOT;
    delete sourceEnv.APACK_HOST_EXECUTABLE;
    sourceEnv.APACK_HOST = flags.host;
  }
  const host = await configuredHostPackagesDir({ dirs: cliDirs(), env: sourceEnv, readOnly: true });
  if (!host) throw new Error('Select the source app with --host <path|beta>. Restoration does not infer a host from the current directory.');
  const sources = fs.readdirSync(host.dir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => path.join(host.dir, entry.name))
    .filter(dir => fs.existsSync(path.join(dir, 'apack.json')))
    .filter(dir => readValidManifest(dir).id === id);
  if (sources.length !== 1) throw new Error(`${host.label} must ship exactly one pack "${id}"; found ${sources.length}.`);
  const context = targetDataContext(env, profile);
  const result = await withPackMutation(context, 'restore', async () => {
    readInstalledPacks(context.installedPacksFile, { strict: true });
    const { version: hostVersion, packFormat } = readHostCompatibility(context.userDataDir);
    return restoreShippedPack(id, sources[0]!, context.packsDir, {
      installedPacksFile: context.installedPacksFile, hostVersion, packFormat,
    });
  });
  console.log(`Restored "${result.name}" v${result.version}${profileLabel(env, profile)}; updates follow the app.`);
  console.log('Open apack to load the restored pack.');
}
