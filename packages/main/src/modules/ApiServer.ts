import { spawn, ChildProcess } from 'child_process';
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// API server event names
const API_SERVER_EVENTS = {
  STARTING: 'api:starting',
  STARTED: 'api:started',
  STOPPED: 'api:stopped',
  ERROR: 'api:error',
  RESTARTING: 'api:restarting',
} as const;

export class ApiServer implements AppModule {
  private apiProcess?: ChildProcess;
  private isShuttingDown = false;
  private restartAttempts = 0;
  private readonly maxRestartAttempts = 3;
  private readonly restartDelay = 2000; // 2 seconds
  private serverReady: Promise<void>;
  private serverReadyResolve?: () => void;

  constructor() {
    // Initialize the server ready promise
    this.serverReady = new Promise<void>((resolve) => {
      this.serverReadyResolve = resolve;
    });
  }

  enable(context: ModuleContext): void {
    const { app } = context;

    // Start API server when app is ready
    app.whenReady().then(() => {
      this.startApiServer();
    });

    // Handle app termination
    app.on('before-quit', () => {
      this.isShuttingDown = true;
      this.stopApiServer();
    });

    // Handle window-all-closed event
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        this.isShuttingDown = true;
        this.stopApiServer();
      }
    });
  }

  private broadcastToWindows(channel: string, data?: any): void {
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send(channel, data);
    });
  }

  private startApiServer(): void {
    if (this.apiProcess) {
      console.log('API server already running');
      return;
    }

    console.log('Starting API server...');
    this.broadcastToWindows(API_SERVER_EVENTS.STARTING);

    // Determine the correct path to the API server
    const isDev = !app.isPackaged;
    let apiPath: string;
    let args: string[] = [];

    if (isDev) {
      // In development, run the build script first then start
      apiPath = path.join(__dirname, '../../api');
      args = ['run', 'build'];
      
      // Build the API first in development
      const buildProcess = spawn('npm', args, {
        cwd: apiPath,
        stdio: 'inherit'
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          console.log('API build completed successfully');
          this.launchApiServer(apiPath);
        } else {
          console.error(`API build failed with code ${code}`);
          this.broadcastToWindows(API_SERVER_EVENTS.ERROR, { 
            error: `API build failed with code ${code}` 
          });
        }
      });
    } else {
      // In production, the API is in the app resources folder
      // Since we disabled asar, it's directly accessible
      apiPath = path.join(process.resourcesPath, 'app', 'packages', 'api');
      
      // Fallback to node_modules/@app/api if it exists there
      if (!fs.existsSync(apiPath)) {
        apiPath = path.join(process.resourcesPath, 'app', 'node_modules', '@app', 'api');
      }
      
      console.log('Production API path:', apiPath);
      this.launchApiServer(apiPath);
    }
  }

  private launchApiServer(apiPath: string): void {
    console.log('Attempting to launch API server from:', apiPath);
    
    // Check if the path exists
    if (!fs.existsSync(apiPath)) {
      console.error('API path does not exist:', apiPath);
      this.broadcastToWindows(API_SERVER_EVENTS.ERROR, { 
        error: `API path does not exist: ${apiPath}` 
      });
      return;
    }
    
    const serverPath = path.join(apiPath, 'dist', 'server.js');
    if (!fs.existsSync(serverPath)) {
      console.error('Server file does not exist:', serverPath);
      this.broadcastToWindows(API_SERVER_EVENTS.ERROR, { 
        error: `Server file does not exist: ${serverPath}` 
      });
      return;
    }
    
    console.log('Server file found at:', serverPath);
    
    // Spawn the API server process
    this.apiProcess = spawn('node', ['dist/server.js'], {
      cwd: apiPath,
      env: {
        ...process.env,
        NODE_ENV: app.isPackaged ? 'production' : 'development',
        API_PORT: '3001',
        DATABASE_PATH: path.join(app.getPath('userData'), 'database.db'),
        USER_DATA_PATH: app.getPath('userData')
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Handle stdout
    this.apiProcess.stdout?.on('data', (data) => {
      const message = data.toString();
      console.log(`[API Server]: ${message}`);
      
      // Check if server is ready (look for specific startup message)
      if (message.includes('WebSocket Server listening') || message.includes('✅ WebSocket Server listening')) {
        console.log('API server is ready!');
        this.broadcastToWindows(API_SERVER_EVENTS.STARTED);
        if (this.serverReadyResolve) {
          this.serverReadyResolve();
          this.serverReadyResolve = undefined;
        }
      }
    });

    // Handle stderr
    this.apiProcess.stderr?.on('data', (data) => {
      console.error(`[API Server Error]: ${data.toString()}`);
    });

    // Handle process exit
    this.apiProcess.on('exit', (code, signal) => {
      console.log(`API server exited with code ${code} and signal ${signal}`);
      this.apiProcess = undefined;
      this.broadcastToWindows(API_SERVER_EVENTS.STOPPED);

      // Reset server ready promise for next start
      this.serverReady = new Promise<void>((resolve) => {
        this.serverReadyResolve = resolve;
      });

      // Attempt to restart unless we're shutting down
      if (!this.isShuttingDown && this.restartAttempts < this.maxRestartAttempts) {
        this.restartAttempts++;
        console.log(`Attempting to restart API server (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`);
        this.broadcastToWindows(API_SERVER_EVENTS.RESTARTING, {
          attempt: this.restartAttempts,
          maxAttempts: this.maxRestartAttempts
        });
        
        setTimeout(() => {
          this.startApiServer();
        }, this.restartDelay);
      } else if (this.restartAttempts >= this.maxRestartAttempts) {
        console.error('Max restart attempts reached. API server will not be restarted.');
        this.broadcastToWindows(API_SERVER_EVENTS.ERROR, {
          error: 'Max restart attempts reached'
        });
      }
    });

    // Handle process errors
    this.apiProcess.on('error', (error) => {
      console.error('Failed to start API server:', error);
      this.broadcastToWindows(API_SERVER_EVENTS.ERROR, {
        error: error.message
      });
    });

    // Reset restart attempts on successful start
    setTimeout(() => {
      if (this.apiProcess && !this.apiProcess.killed) {
        console.log('API server started successfully');
        this.restartAttempts = 0;
      }
    }, 5000);
  }

  private stopApiServer(): void {
    if (!this.apiProcess) {
      return;
    }

    console.log('Stopping API server...');
    
    // Try graceful shutdown first
    this.apiProcess.kill('SIGTERM');

    // Force kill after timeout
    setTimeout(() => {
      if (this.apiProcess && !this.apiProcess.killed) {
        console.log('Force killing API server...');
        this.apiProcess.kill('SIGKILL');
      }
    }, 5000);
  }

  // Public method to get API server status
  public getStatus(): { running: boolean; pid?: number; restartAttempts: number } {
    return {
      running: !!this.apiProcess && !this.apiProcess.killed,
      pid: this.apiProcess?.pid,
      restartAttempts: this.restartAttempts
    };
  }

  // Wait for server to be ready with timeout
  public waitForReady(timeout = 30000): Promise<void> {
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

// Factory function for consistency with other modules
export function createApiServer(): ApiServer {
  return new ApiServer();
}