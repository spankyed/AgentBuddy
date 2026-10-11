import semver from 'semver';
import { parseReleaseChannel } from '../utils.ts';
import { manageInstalledApp, type AppCommandOptions } from './installed-app.ts';

type Action = AppCommandOptions['action'];

const FLAGS: Record<Action, string[]> = {
  install: ['--replace', '--relaunch'],
  upgrade: ['--force', '--relaunch'],
  uninstall: [],
};

export function parseAppCommand(action: Action, args: string[]): AppCommandOptions {
  // App installation always defaults to production, including from a beta-bundled CLI.
  const { env, args: rest } = parseReleaseChannel(args);
  if (env !== 'production' && env !== 'beta') throw new Error('Only production and beta apps are published. Use --channel beta.');
  const positional: string[] = [];
  for (const arg of rest) {
    if (FLAGS[action].includes(arg)) continue;
    if (arg.startsWith('-')) throw new Error(`Unknown option for apack ${action}: ${arg}`);
    positional.push(arg);
  }
  if (positional.length > (action === 'uninstall' ? 0 : 1)) throw new Error(`Unexpected arguments for apack ${action}. See --help.`);
  const requested = positional[0];
  const version = requested && requested !== 'latest' ? semver.valid(requested.replace(/^v/, '')) : undefined;
  if (version === null) throw new Error(`Invalid version: ${requested}. Use a full version such as 0.4.0. For packs, use apack pack install <source>.`);
  if (version && env === 'production' && semver.prerelease(version)) throw new Error('A prerelease needs --channel beta; production installs stable releases only.');
  return { action, channel: env, version, replace: rest.includes('--replace'), force: rest.includes('--force'), relaunch: rest.includes('--relaunch') };
}

export async function appCommand(action: Action, args: string[]): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: apack ${action}${action === 'uninstall' ? '' : ' [version]'} [--channel production|beta] ${FLAGS[action].map(flag => `[${flag}]`).join(' ')}

${action === 'uninstall' ? 'Remove the app from /Applications. User data and settings are kept.' : 'Download a specific release or the latest production release into /Applications.'}
${action === 'install' ? 'An existing app requires --replace, even if its version cannot be read.' : action === 'upgrade' ? 'Requires an installed app. --force allows reinstalling or downgrading.' : ''}
--channel beta selects the beta app.
${action === 'uninstall' ? '' : '--relaunch opens the app after installation.\nVersions may include a leading v. No version, or latest, selects the newest release.'}`);
    return;
  }
  await manageInstalledApp(parseAppCommand(action, args));
}
