import { spawn } from 'child_process';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import getPort from 'get-port';
import { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';
import { 
  API_CONFIG, 
  API_EVENTS, 
  getApiPaths, 
  getEnvironment, 
  getNodeExecutable, 
  getExecutionArgs 
} from './api-server/config.js';
import { ProcessManager, broadcastEvent } from './api-server/process-manager.js';

export class ApiServer implements AppModule {
  private processManager: ProcessManager;
  private isShuttingDown = false;
  private restartAttempts = 0;
  private serverReady: Promise<void>;
  private serverReadyResolve?: () => void;
  private actualPort?: number;

  constructor() {
    this.processManager = new ProcessManager({
      onReady: (port) => this.handleServerReady(port),
      onExit: (code, signal) => this.handleProcessExit(code, signal),
      onError: (error) => this.handleProcessError(error),
    });

    this.serverReady = this.createReadyPromise();
  }

  private createReadyPromise(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.serverReadyResolve = resolve;
    });
  }

  enable(context: ModuleContext): void {
    const { app } = context;

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

    broadcastEvent(API_EVENTS.STARTING);

    const paths = getApiPaths();
    
    // In development, the API should already be built
    // Just launch it directly
    await this.launchApiServer(paths.apiPath, paths.fallbackPath);
  }

  private async launchApiServer(apiPath: string, fallbackPath?: string): Promise<void> {
    // Check paths
    if (!fs.existsSync(apiPath)) {
      if (fallbackPath && fs.existsSync(fallbackPath)) {
        apiPath = fallbackPath;
      } else {
        const error = `[MAIN] API path does not exist: ${apiPath}`;
        console.error(error);
        broadcastEvent(API_EVENTS.ERROR, { error });
        return;
      }
    }

    const serverPath = path.join(apiPath, 'dist', 'server.js');
    if (!fs.existsSync(serverPath)) {
      const error = `[MAIN] Server file does not exist: ${serverPath}`;
      console.error(error);
      broadcastEvent(API_EVENTS.ERROR, { error });
      return;
    }

    // Get available port
    const port = await getPort({ port: API_CONFIG.DEFAULT_PORT });
    console.log(`[MAIN] Selected port ${port} for API server`);

    // Spawn process
    const nodeExecutable = getNodeExecutable();
    const execArgs = getExecutionArgs(apiPath, 'dist/server.js');
    
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
    console.log(`[MAIN] API server is running on port ${port}`);
    broadcastEvent(API_EVENTS.STARTED, { port });
    
    if (this.serverReadyResolve) {
      this.serverReadyResolve();
      this.serverReadyResolve = undefined;
    }
  }

  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    console.error(`[MAIN] API server exited with code ${code} and signal ${signal}`);
    broadcastEvent(API_EVENTS.STOPPED);

    // Reset state
    this.actualPort = undefined;
    this.serverReady = this.createReadyPromise();

    // Handle restart
    if (!this.isShuttingDown && this.restartAttempts < API_CONFIG.MAX_RESTART_ATTEMPTS) {
      this.restartAttempts++;
      console.warn(`[MAIN] Restarting API server (attempt ${this.restartAttempts}/${API_CONFIG.MAX_RESTART_ATTEMPTS})...`);
      broadcastEvent(API_EVENTS.RESTARTING, {
        attempt: this.restartAttempts,
        maxAttempts: API_CONFIG.MAX_RESTART_ATTEMPTS
      });
      
      setTimeout(() => this.startApiServer(), API_CONFIG.RESTART_DELAY);
    } else if (this.restartAttempts >= API_CONFIG.MAX_RESTART_ATTEMPTS) {
      console.error('[MAIN] Max restart attempts reached');
      broadcastEvent(API_EVENTS.ERROR, { error: 'Max restart attempts reached' });
    }
  }

  private handleProcessError(error: Error): void {
    console.error('[MAIN] Failed to start API server:', error);
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