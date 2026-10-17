import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { getEnvironmentData, setEnvironmentData, isMainThread, isInternalThread, MessageChannel, type MessagePort } from 'node:worker_threads';
import { COMPILER_INPUTS_ENV, readCompilerInstallationInputs } from './compiler-installation-inputs.ts';
import { BUILD_INPUTS_DIRECTORY_ENV } from './compiler-read-tree.ts';
import { beginCompilerStartupInputs } from './compiler-startup-inputs.ts';
import { beginFrontendNativeInputs } from './frontend-native-inputs.ts';
import { type CompilerInputObservations } from '@apackdev/host/build/compiler-inputs';
import { COMPILER_NODE_OPTIONS_ENV } from './compiler-startup-options.ts';
import { compilerThreadHandoff, ownCompilerThreads, serveCompilerThread } from './compiler-threads.ts';
import { BUILD_INPUTS_IPC_ENV } from './build-watch-inputs.ts';
import type { MachOLibraryEnvironment } from './compiler-native-libraries.ts';

interface CompilerThreadLineage {
  readonly pid: number;
  readonly mode: 'build' | 'frontend';
  readonly loader: SharedArrayBuffer;
  readonly nativeEnvironment: MachOLibraryEnvironment;
}
const LINEAGE = 'apack.compiler.thread';
const inherited = getEnvironmentData(LINEAGE) as CompilerThreadLineage | undefined;
const primaryLoader = isInternalThread && inherited?.pid === process.pid;
const handoff = !isMainThread && !isInternalThread ? compilerThreadHandoff() : undefined;

if ((isMainThread && (process.env.APACK_BUILD_WORKER === '1' || process.env.APACK_FRONTEND_WORKER === '1') && process.send && process.connected) || primaryLoader || handoff) {
  const mode = inherited?.pid === process.pid ? inherited.mode : process.env.APACK_FRONTEND_WORKER === '1' ? 'frontend' : 'build';
  if (handoff) Object.assign(process.env, handoff.environment);
  const compiler = readCompilerInstallationInputs();
  const workspace = process.env[BUILD_INPUTS_DIRECTORY_ENV];
  const userOptions = process.env[COMPILER_NODE_OPTIONS_ENV];
  if (!compiler || !workspace || !path.isAbsolute(workspace) || userOptions === undefined) {
    throw new Error('Compiler startup requires its captured installation, input workspace and user options');
  }
  const temporary = path.join(workspace, 'tmp');
  fs.mkdirSync(temporary, { recursive: true });
  for (const key of ['TMPDIR', 'TMP', 'TEMP']) process.env[key] = temporary;
  const environment = inherited?.pid === process.pid ? inherited.nativeEnvironment : undefined;
  const buildInputs = mode === 'build' ? beginCompilerStartupInputs(process.cwd(), workspace, compiler.paths, userOptions, environment) : undefined;
  const frontendInputs = mode === 'frontend' ? beginFrontendNativeInputs(process.cwd(), workspace, compiler.paths, environment) : undefined;
  const startup = buildInputs ?? frontendInputs!;
  const ready = new Int32Array(primaryLoader ? inherited.loader : new SharedArrayBuffer(4));
  if (primaryLoader) Atomics.store(ready, 0, 1);
  else {
    setEnvironmentData(LINEAGE, { pid: process.pid, mode, loader: ready.buffer, nativeEnvironment: startup.nativeEnvironment });
    const collectThreads = ownCompilerThreads(__filename, workspace, {
      [COMPILER_INPUTS_ENV]: process.env[COMPILER_INPUTS_ENV]!,
      [BUILD_INPUTS_DIRECTORY_ENV]: workspace,
      [COMPILER_NODE_OPTIONS_ENV]: userOptions,
      [BUILD_INPUTS_IPC_ENV]: process.env[BUILD_INPUTS_IPC_ENV] ?? '0',
    });
    let port: MessagePort | undefined;
    const request = (type: 'snapshot' | 'finish'): Promise<CompilerInputObservations[]> => {
      // Filesystem interception observes native ESM reads too. Never create a loader just to capture them:
      // doing so would replay require preloads and change their ordering relative to user initialization.
      if (!Atomics.load(ready, 0)) return Promise.resolve([]);
      if (!port) {
        const { port1, port2 } = new MessageChannel();
        register(pathToFileURL(path.join(__dirname, '../bin/compiler-startup-coordinator.mjs')), {
          data: { port: port2, mode }, transferList: [port2],
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
    const collect = async (finish: boolean) => (await Promise.all([
      request(finish ? 'finish' : 'snapshot'), collectThreads(finish),
    ])).flat();
    let captured: Promise<void> | undefined, finished: Promise<CompilerInputObservations[]> | undefined;
    if (buildInputs) {
      buildInputs.capture = () => captured ??= (async () => { buildInputs.initial = await collect(false); })();
      buildInputs.finish = () => finished ??= collect(true);
    }
    if (frontendInputs) {
      frontendInputs.snapshot = async () => [...await collect(false), startup.finishLocal()];
      frontendInputs.close = async () => {
        try { await collect(true); }
        finally { startup.disposeLocal(); }
      };
    }
    if (handoff) serveCompilerThread(handoff,
      async () => [...await collect(false), startup.finishLocal()],
      async () => {
        try { return [...await collect(true), startup.finishLocal()]; }
        finally { startup.disposeLocal(); }
      });
  }
  // Keep the handoff for a loader created later by the compiler; children inherit only user options.
  process.env.NODE_OPTIONS = userOptions;
}
