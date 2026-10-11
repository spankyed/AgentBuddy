import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { randomBytes, randomUUID } from 'crypto';
import getPort, { clearLockedPorts } from 'get-port';
import { AppModule } from '../../AppModule.ts';
import { ModuleContext } from '../../ModuleContext.ts';
import { 
  API_CONFIG, 
  API_EVENTS, 
  getApiPaths, 
  getEnvironment, 
  getNodeExecutable, 
  getExecutionArgs 
} from './config.ts';
import { ProcessManager, broadcastEvent } from './process-manager.ts';
import { logInfo, logError, logWarn, getLogger, logStartupBanner } from './logger.ts';
import { getAppContext } from '../../app-context.ts';
import { errorMessage } from '@apack/sdk/utils/pure';

export class ApiServer implements AppModule {
  private processManager: ProcessManager;
  private isShuttingDown = false;
  private restartAttempts = 0;
  private serverReady: Promise<void>;
  private serverReadyResolve?: () => void;
  private serverReadyReject?: (error: Error) => void;
  private actualPort?: number;
  /** The port the last successful launch used, reused on restart so the renderer's URL stays valid */
  private preferredPort: number = API_CONFIG.DEFAULT_PORT;
  private lastError?: { message: string; stack?: string };
  /** The reload in flight, so a rebuild arriving mid-reload joins it rather than starting a second API */
  private reloading?: Promise<void>;
  /** Whether the next readiness is a reload's, which `handleServerReady` consumes onto `api:started` */
  private announceReload = false;
  private readonly startupId = randomUUID();
  /**
   * The API's token for this app run: the API refuses connections and requests without it. The API process gets it
   * in its environment, the app's windows through the preload (`api:token`); web pages in the in-app browser have
   * no preload and never see it.
   */
  private readonly apiToken = randomBytes(32).toString('base64url');

  constructor() {
    process.env.APACK_STARTUP_ID = this.startupId;
    this.processManager = new ProcessManager({
      onReady: (port) => this.handleServerReady(port),
      onExit: (code, signal) => this.handleProcessExit(code, signal),
      onError: (error) => this.handleProcessError(error),
    });

    this.serverReady = this.createReadyPromise();
  }

  private createReadyPromise(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.serverReadyResolve = resolve;
      this.serverReadyReject = reject;
    });
  }

  enable(context: ModuleContext): void {
    const { app } = context;

    // Log production startup info
    if (app.isPackaged) {
      logStartupBanner();
      logInfo('Startup ID:', this.startupId);
      logInfo('apack API Server Module Enabled');
      logInfo('Log file location:', getLogger().getLogPath());
      logInfo('Renderer log file location:', getLogger().getRendererLogPath());
      logInfo('App events log file location:', getLogger().getAppEventsLogPath());
    }

    // The app's windows read the API token as their preload loads
    ipcMain.on('api:token', (event) => { event.returnValue = this.apiToken; });

    // Let renderer query current API status on startup (avoids IPC race condition)
    ipcMain.handle('api:get-status', () => ({
      running: this.processManager.isRunning(),
      port: this.actualPort,
      error: this.lastError,
      restartAttempts: this.restartAttempts,
      startupId: this.startupId,
      logPath: getLogger().getLogPath(),
      rendererLogPath: getLogger().getRendererLogPath(),
      appEventsLogPath: getLogger().getAppEventsLogPath(),
    }));

    // Reveal the log file in the system file manager
    ipcMain.handle('api:open-log-file', () => {
      shell.showItemInFolder(getLogger().getLogPath());
    });

    // Reload the renderer page (bypasses will-navigate security handler)
    ipcMain.handle('app:reload', (event) => {
      event.sender.reload();
    });

    // Relaunch the entire Electron app
    ipcMain.handle('app:relaunch', () => {
      app.relaunch();
      app.exit(0);
    });

    app.whenReady().then(() => this.startApiServer());
    
    app.on('before-quit', () => {
      this.isShuttingDown = true;
      this.stopApiServer();
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.isShuttingDown = true;
        this.stopApiServer();
      }
    });
  }

  private async startApiServer(): Promise<void> {
    if (this.processManager.isRunning()) return;

    this.lastError = undefined; // Clear stale error so getStatus() doesn't report old crashes during restart
    this.serverReady = this.createReadyPromise(); // Reset promise so waitForReady() works across restarts
    logInfo('[MAIN] Starting API server...');
    broadcastEvent(API_EVENTS.STARTING);

    const paths = getApiPaths();
    await this.cleanupOrphanedApiChildren(paths.apiPath);
    await this.launchApiServer(paths.apiPath);
  }

  private async cleanupOrphanedApiChildren(apiPath: string): Promise<void> {
    if (process.platform !== 'darwin' && process.platform !== 'linux') return;

    const serverPath = path.join(apiPath, 'dist', 'server.js');
    const psOutput = await new Promise<string>((resolve) => {
      execFile('ps', ['-axo', 'pid=,ppid=,command='], (error, stdout) => {
        if (error) {
          logWarn('[MAIN] Failed to inspect existing API processes before startup:', error.message);
          resolve('');
          return;
        }
        resolve(stdout);
      });
    });

    for (const line of psOutput.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (!match) continue;

      const pid = Number(match[1]);
      const ppid = Number(match[2]);
      const command = match[3];
      if (pid === process.pid) continue;
      if (!command.includes(serverPath)) continue;
      if (!command.includes('apack')) continue;

      if (ppid !== 1) {
        logWarn('[MAIN] Existing API child found before startup; leaving attached process alone', { pid, ppid });
        continue;
      }

      try {
        process.kill(pid, 'SIGKILL');
        logWarn('[MAIN] Killed orphaned API child before startup', { pid, ppid, serverPath });
      } catch (error) {
        logWarn('[MAIN] Failed to kill orphaned API child before startup', {
          pid,
          ppid,
          error: errorMessage(error),
        });
      }
    }
  }

  private async launchApiServer(apiPath: string): Promise<void> {
    // Validate API path exists
    logInfo(`[MAIN] Checking API path: ${apiPath}`);
    if (!fs.existsSync(apiPath)) {
      const error = `API path does not exist: ${apiPath}`;
      logError(`[MAIN] ${error}`);
      broadcastEvent(API_EVENTS.ERROR, { error });
      this.serverReadyReject?.(new Error(error));
      return;
    }

    const serverPath = path.join(apiPath, 'dist', 'server.js');
    logInfo(`[MAIN] Checking server file: ${serverPath}`);
    if (!fs.existsSync(serverPath)) {
      const error = `Server file does not exist: ${serverPath}`;
      logError(`[MAIN] ${error}`);
      broadcastEvent(API_EVENTS.ERROR, { error });
      this.serverReadyReject?.(new Error(error));
      return;
    }
    logInfo('[MAIN] Server file found, proceeding with launch...');

    // Prefer the port the renderer already knows. get-port locks a port it hands out for 15-30s,
    // so asking for the same one again inside RESTART_DELAY falls back to a random port and leaves
    // the renderer's WebSocket pointed at the old one. clearLockedPorts releases our own lock; if
    // the port is genuinely taken, get-port still moves on.
    clearLockedPorts();
    const port = await getPort({ port: this.preferredPort });
    logInfo(`[MAIN] Selected port ${port} for API server`);

    // Spawn process
    const nodeExecutable = getNodeExecutable();
    const execArgs = getExecutionArgs(apiPath, 'dist/server.js');
    
    logInfo(`[MAIN] Spawning API server:`);
    logInfo(`[MAIN]   Executable: ${nodeExecutable}`);
    logInfo(`[MAIN]   Args: ${JSON.stringify(execArgs)}`);
    logInfo(`[MAIN]   CWD: ${apiPath}`);
    
    const apiProcess = spawn(nodeExecutable, execArgs, {
      cwd: apiPath,
      env: getEnvironment(port, {
        apiToken: this.apiToken,
        startupId: this.startupId,
        logDir: getAppContext().logsDir,
      }),
      // The fourth entry is an IPC channel the app never sends on: it closes when this process dies, which is how
      // the API hears that its parent is gone (`process.on('disconnect')`) instead of polling for it
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      detached: false,
      // windowsHide: false
    });

    this.processManager.setProcess(apiProcess);
    this.scheduleRestartResetTimeout();
  }

  private handleServerReady(port: number): void {
    this.actualPort = port;
    this.preferredPort = port;
    this.lastError = undefined;
    logInfo(`[MAIN] API server is running on port ${port}`);
    // `reloaded` says the old socket died on purpose, which is what lets the window resubscribe at once
    // rather than wait out its client's backoff — see `reloadApiServer`
    const reloaded = this.announceReload;
    this.announceReload = false;
    broadcastEvent(API_EVENTS.STARTED, { port, startupId: this.startupId, ...(reloaded && { reloaded: true }) });
    
    if (this.serverReadyResolve) {
      this.serverReadyResolve();
      this.serverReadyResolve = undefined;
    }
  }

  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    logError(`[MAIN] API server exited with code ${code} and signal ${signal}`);
    const errors = this.processManager.getFatalErrors();
    const stderr = this.processManager.getLastStderr();
    if (errors.length > 0) {
      this.lastError = {
        message: errors[0].message,
        stack: errors.map(e => e.stack || e.message).join('\n\n'),
      };
    } else {
      this.lastError = { message: stderr || `Backend process exited unexpectedly (code ${code})` };
    }
    const willRestart = !this.isShuttingDown && this.restartAttempts < API_CONFIG.MAX_RESTART_ATTEMPTS;
    broadcastEvent(API_EVENTS.STOPPED, { error: this.lastError, restarting: willRestart });

    // Reset state
    this.actualPort = undefined;

    // Handle restart
    if (willRestart) {
      this.restartAttempts++;
      logWarn(`[MAIN] Restarting API server (attempt ${this.restartAttempts}/${API_CONFIG.MAX_RESTART_ATTEMPTS})...`);
      broadcastEvent(API_EVENTS.RESTARTING, {
        attempt: this.restartAttempts,
        maxAttempts: API_CONFIG.MAX_RESTART_ATTEMPTS,
        startupId: this.startupId,
      });

      setTimeout(() => this.startApiServer(), API_CONFIG.RESTART_DELAY);
    } else if (this.restartAttempts >= API_CONFIG.MAX_RESTART_ATTEMPTS) {
      this.lastError = { message: 'Max restart attempts reached' };
      logError('[MAIN] Max restart attempts reached');
      broadcastEvent(API_EVENTS.ERROR, { error: 'Max restart attempts reached' });
      this.serverReadyReject?.(new Error('Max restart attempts reached'));
    }
  }

  private handleProcessError(error: Error): void {
    this.lastError = { message: error.message, stack: error.stack };
    logError('[MAIN] Failed to start API server:', error);
    broadcastEvent(API_EVENTS.ERROR, { error: error.message });
  }

  private scheduleRestartResetTimeout(): void {
    setTimeout(() => {
      if (this.processManager.isRunning()) {
        this.restartAttempts = 0;
      }
    }, API_CONFIG.SUCCESS_CHECK_DELAY);
  }

  private stopApiServer(): void {
    this.processManager.kill('SIGTERM', API_CONFIG.SHUTDOWN_TIMEOUT);
  }

  /**
   * Ends the API and starts it again, for a development rebuild — **not the restart the rest of this class
   * means.**
   *
   * **It must not look like a crash.** `handleProcessExit` counts every exit against
   * `MAX_RESTART_ATTEMPTS`, forgiven only `SUCCESS_CHECK_DELAY` after a launch that is still running, so a
   * handful of quick edits would exhaust the budget and land on `api:stopped { restarting: false }`, the
   * shell's terminal `error` state, and main refusing to start the API again. `ProcessManager.stop()` is
   * what keeps it off that path, and it waits for the exit, which is what makes the next launch correct.
   *
   * **It does not wait for readiness, deliberately.** `waitForReady` reads `serverReady`, which
   * `startApiServer` replaces on every launch — so if this launch crashed before it was ready, the crash
   * path's own restart would orphan the promise this was holding and the wait would run to
   * `READY_TIMEOUT`, keeping the loop silent for a minute. Nothing needs it either: a rebuild arriving
   * while the previous API is still booting *should* replace it, because that API is already stale.
   */
  public reloadApiServer(): Promise<void> {
    this.reloading ??= (async () => {
      try {
        // Read by `handleServerReady`, which happens after this resolves — so it is a flag and not this
        // promise, however much one field would be tidier than two
        this.announceReload = true;
        await this.processManager.stop('SIGTERM', API_CONFIG.SHUTDOWN_TIMEOUT);
        await this.startApiServer();
      } finally {
        this.reloading = undefined;
      }
    })();
    return this.reloading;
  }

  public getStatus(): {
    running: boolean;
    pid?: number;
    port?: number;
    restartAttempts: number;
    startupId: string;
    logPath: string;
    rendererLogPath: string;
    appEventsLogPath: string;
  } {
    return {
      running: this.processManager.isRunning(),
      pid: this.processManager.getPid(),
      port: this.actualPort,
      restartAttempts: this.restartAttempts,
      startupId: this.startupId,
      logPath: getLogger().getLogPath(),
      rendererLogPath: getLogger().getRendererLogPath(),
      appEventsLogPath: getLogger().getAppEventsLogPath(),
    };
  }

  public waitForReady(timeout = API_CONFIG.READY_TIMEOUT): Promise<void> {
    return Promise.race([
      this.serverReady,
      new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`API server failed to start within ${timeout}ms`));
        }, timeout);
      })
    ]);
  }
}

export function createApiServer(): ApiServer {
  return new ApiServer();
}
