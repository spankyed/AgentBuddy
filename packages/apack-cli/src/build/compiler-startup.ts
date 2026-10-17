import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { getEnvironmentData, setEnvironmentData, isMainThread, isInternalThread, threadId, MessageChannel, type MessagePort } from 'node:worker_threads';
import { readCompilerInstallationInputs } from './compiler-installation-inputs.ts';
import { BUILD_INPUTS_DIRECTORY_ENV } from './compiler-read-tree.ts';
import { beginCompilerStartupInputs } from './compiler-startup-inputs.ts';
import { type CompilerInputObservations } from '@apackdev/host/build/compiler-inputs';
import { COMPILER_NODE_OPTIONS_ENV } from './compiler-startup-options.ts';

interface CompilerThreadLineage {
  readonly pid: number;
  readonly parent: number;
  readonly loader: SharedArrayBuffer;
}
const LINEAGE = 'apack.compiler.thread';
const inherited = getEnvironmentData(LINEAGE) as CompilerThreadLineage | undefined;
const primaryLoader = isInternalThread && inherited?.pid === process.pid && inherited.parent === 0;
// Tag regular workers too: their loader is not this process's primary module loader.
if (inherited?.pid === process.pid) setEnvironmentData(LINEAGE, { ...inherited, parent: threadId });

if ((isMainThread && process.env.APACK_BUILD_WORKER === '1' && process.send && process.connected) || primaryLoader) {
  const compiler = readCompilerInstallationInputs();
  const workspace = process.env[BUILD_INPUTS_DIRECTORY_ENV];
  const userOptions = process.env[COMPILER_NODE_OPTIONS_ENV];
  if (!compiler || !workspace || !path.isAbsolute(workspace) || userOptions === undefined) {
    throw new Error('Compiler startup requires its captured installation, input workspace and user options');
  }
  const temporary = path.join(workspace, 'tmp');
  fs.mkdirSync(temporary, { recursive: true });
  for (const key of ['TMPDIR', 'TMP', 'TEMP']) process.env[key] = temporary;
  const startup = beginCompilerStartupInputs(process.cwd(), workspace, compiler.paths, userOptions);
  const ready = new Int32Array(primaryLoader ? inherited.loader : new SharedArrayBuffer(4));
  if (primaryLoader) Atomics.store(ready, 0, 1);
  else {
    setEnvironmentData(LINEAGE, { pid: process.pid, parent: threadId, loader: ready.buffer });
    let port: MessagePort | undefined;
    const request = (type: 'snapshot' | 'finish'): Promise<CompilerInputObservations[]> => {
      // Filesystem interception observes native ESM reads too. Never create a loader just to capture them:
      // doing so would replay require preloads and change their ordering relative to user initialization.
      if (!Atomics.load(ready, 0)) return Promise.resolve([]);
      if (!port) {
        const { port1, port2 } = new MessageChannel();
        register(pathToFileURL(path.join(__dirname, '../bin/compiler-startup-coordinator.mjs')), {
          data: { port: port2 }, transferList: [port2],
        });
        port = port1;
        port.unref();
      }
      const channel = port;
      return new Promise((resolve, reject) => {
        const closed = () => reject(new Error('Compiler loader closed before returning its observations'));
        channel.once('message', message => {
          channel.removeListener('close', closed);
          channel.unref();
          if (type === 'finish') channel.close();
          if (message.error) reject(new Error(message.error));
          else resolve([message.observations]);
        });
        channel.once('close', closed);
        channel.ref();
        channel.postMessage(type);
      });
    };
    let captured: Promise<void> | undefined, finished: Promise<CompilerInputObservations[]> | undefined;
    startup.capture = () => captured ??= (async () => { startup.initial = await request('snapshot'); })();
    startup.finish = () => finished ??= request('finish');
  }
  // Keep the handoff for a loader created later by the compiler; children inherit only user options.
  process.env.NODE_OPTIONS = userOptions;
}
