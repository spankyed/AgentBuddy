import { spawn } from 'child_process';
import { app, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import getPort from 'get-port';
import { AppModule } from '../../AppModule.js';
import { ModuleContext } from '../../ModuleContext.js';
import { 
  API_CONFIG, 
  API_EVENTS, 
  getApiPaths, 
  getEnvironment, 
  getNodeExecutable, 
  getExecutionArgs 
} from './config.js';
import { ProcessManager, broadcastEvent } from './process-manager.js';
import { logInfo, logError, logWarn, getLogger, logStartupBanner } from './logger.js';

export class ApiServer implements AppModule {
  private processManager: ProcessManager;
  private isShuttingDown = false;
  private restartAttempts = 0;
  private serverReady: Promise<void>;
  private serverReadyResolve?: () => void;
  private serverReadyReject?: (error: Error) => void;
  private actualPort?: number;
  private lastError?: { message: string; stack?: string };

  constructor() {
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
      logInfo('AgentBuddy API Server Module Enabled');
      logInfo('Log file location:', getLogger().getLogPath());
    }

    // Let renderer query current API status on startup (avoids IPC race condition)
    ipcMain.handle('api:get-status', () => ({
      running: this.processManager.isRunning(),
      port: this.actualPort,
      error: this.lastError,
      restartAttempts: this.restartAttempts,
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
    await this.launchApiServer(paths.apiPath);
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

    // Get available port
    const port = await getPort({ port: API_CONFIG.DEFAULT_PORT });
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
      env: getEnvironment(port),
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      // windowsHide: false
    });

    this.processManager.setProcess(apiProcess);
    this.scheduleRestartResetTimeout();
  }

  private handleServerReady(port: number): void {
    this.actualPort = port;
    this.lastError = undefined;
    logInfo(`[MAIN] API server is running on port ${port}`);
    broadcastEvent(API_EVENTS.STARTED, { port });
    
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
        maxAttempts: API_CONFIG.MAX_RESTART_ATTEMPTS
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

  public getStatus(): { running: boolean; pid?: number; port?: number; restartAttempts: number } {
    return {
      running: this.processManager.isRunning(),
      pid: this.processManager.getPid(),
      port: this.actualPort,
      restartAttempts: this.restartAttempts
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