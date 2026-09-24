import {app, dialog} from 'electron';
import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {getAppContext} from '../app-context.js';

const BIN_DIR = '/usr/local/bin';

/** Beta installs alongside production, so its command gets its own name. */
export function cliCommandName(): string {
  return getAppContext().env === 'beta' ? 'abuddy-beta' : 'abuddy';
}

/** Packaged from packages/abuddy-cli/bin/app-launcher.sh (see electron-builder.mjs). */
function launcherPath(): string {
  return path.join(process.resourcesPath, 'cli', 'abuddy');
}

function readLink(file: string): string | null | undefined {
  try {
    return fs.readlinkSync(file);
  } catch (err: any) {
    // undefined: nothing there; null: a regular file we didn't create
    return err?.code === 'ENOENT' ? undefined : null;
  }
}

const shellQuote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;
const appleScriptString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

async function linkWithAdminPrivileges(source: string, target: string): Promise<void> {
  const command = `mkdir -p ${shellQuote(BIN_DIR)} && ln -sf ${shellQuote(source)} ${shellQuote(target)}`;
  await promisify(execFile)('osascript', ['-e', `do shell script ${appleScriptString(command)} with administrator privileges`]);
}

/** "Install 'abuddy' command in PATH": symlink the app-bundled CLI launcher into /usr/local/bin. */
export async function installCliCommand(): Promise<void> {
  const name = cliCommandName();
  const source = launcherPath();
  const target = path.join(BIN_DIR, name);

  if (!fs.existsSync(source)) {
    await dialog.showMessageBox({type: 'error', message: `This build of ${app.getName()} doesn't include the '${name}' command.`});
    return;
  }

  const existing = readLink(target);
  if (existing === source) {
    await dialog.showMessageBox({message: `The '${name}' command is already installed in ${BIN_DIR}.`});
    return;
  }
  if (existing !== undefined) {
    const {response} = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Replace', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      message: `${target} already exists${existing ? ` and points to ${existing}` : ''}. Replace it with ${app.getName()}'s '${name}' command?`,
    });
    if (response !== 0) return;
  }

  try {
    fs.mkdirSync(BIN_DIR, {recursive: true});
    fs.rmSync(target, {force: true});
    fs.symlinkSync(source, target);
  } catch (err: any) {
    if (err?.code !== 'EACCES' && err?.code !== 'EPERM') throw err;
    try {
      await linkWithAdminPrivileges(source, target);
    } catch (elevationError: any) {
      // -128: the user cancelled the password prompt
      if (String(elevationError?.stderr ?? elevationError?.message).includes('-128')) return;
      await dialog.showMessageBox({type: 'error', message: `Couldn't install the '${name}' command.`, detail: String(elevationError?.message ?? elevationError)});
      return;
    }
  }

  await dialog.showMessageBox({message: `The '${name}' command is installed. Open a new terminal and run '${name} --help'.`});
}
