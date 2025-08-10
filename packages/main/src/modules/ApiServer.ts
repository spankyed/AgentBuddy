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
      // API server already running
      return;
    }

    // Starting API server
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
          // API build completed successfully
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
      
      // Production API path
      this.launchApiServer(apiPath);
    }
  }

  private launchApiServer(apiPath: string): void {
    // Attempting to launch API server
    
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
    
    // Server file found
    
    // Spawn the API server process using Electron's Node.js
    // In production, use Electron's Node.js executable to ensure native module compatibility
    const nodeExecutable = app.isPackaged 
      ? process.execPath  // Use Electron's built-in Node
      : 'node';           // Use system Node in development
    
    // When using Electron's executable, we need to pass the script as an argument
    const execArgs = app.isPackaged 
      ? [path.join(apiPath, 'dist', 'server.js')]
      : ['dist/server.js'];
    
    this.apiProcess = spawn(nodeExecutable, execArgs, {
      cwd: apiPath,
      env: {
        ...process.env,
        NODE_ENV: app.isPackaged ? 'production' : 'development',
        API_PORT: '3001',
        DATABASE_PATH: path.join(app.getPath('userData'), 'database.db'),
        USER_DATA_PATH: app.getPath('userData'),
        // Ensure Electron's Node environment is used
        ELECTRON_RUN_AS_NODE: '1'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Handle stdout with error handling
    if (this.apiProcess.stdout) {
      this.apiProcess.stdout.on('data', (data) => {
        try {
          const message = data.toString();
          // Log API server output for debugging if needed
          // console.log(`[API Server]: ${message}`);
          
          // Check if server is ready (look for specific startup message)
          if (message.includes('WebSocket Server listening') || message.includes('✅ WebSocket Server listening')) {
            // API server is ready
            this.broadcastToWindows(API_SERVER_EVENTS.STARTED);
            if (this.serverReadyResolve) {
              this.serverReadyResolve();
              this.serverReadyResolve = undefined;
            }
          }
        } catch (error) {
          console.error('Error handling API stdout:', error);
        }
      });
      
      // Handle stdout errors
      this.apiProcess.stdout.on('error', (error) => {
        console.error('API stdout error:', error);
      });
    }

    // Handle stderr with error handling
    if (this.apiProcess.stderr) {
      this.apiProcess.stderr.on('data', (data) => {
        try {
          console.error(`[API Server Error]: ${data.toString()}`);
        } catch (error) {
          console.error('Error handling API stderr:', error);
        }
      });
      
      // Handle stderr errors
      this.apiProcess.stderr.on('error', (error) => {
        console.error('API stderr error:', error);
      });
    }

    // Handle process exit
    this.apiProcess.on('exit', (code, signal) => {
      console.error(`API server exited with code ${code} and signal ${signal}`);
      this.apiProcess = undefined;
      this.broadcastToWindows(API_SERVER_EVENTS.STOPPED);

      // Reset server ready promise for next start
      this.serverReady = new Promise<void>((resolve) => {
        this.serverReadyResolve = resolve;
      });

      // Attempt to restart unless we're shutting down
      if (!this.isShuttingDown && this.restartAttempts < this.maxRestartAttempts) {
        this.restartAttempts++;
        console.warn(`Attempting to restart API server (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`);
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
        // API server started successfully
        this.restartAttempts = 0;
      }
    }, 5000);
  }

  private stopApiServer(): void {
    if (!this.apiProcess) {
      return;
    }

    // Stopping API server
    
    // Remove all listeners to prevent EPIPE errors
    this.apiProcess.stdout?.removeAllListeners();
    this.apiProcess.stderr?.removeAllListeners();
    
    // Destroy the streams to prevent further writes
    this.apiProcess.stdout?.destroy();
    this.apiProcess.stderr?.destroy();
    
    // Try graceful shutdown first
    try {
      this.apiProcess.kill('SIGTERM');
    } catch (error) {
      console.error('Error sending SIGTERM to API server:', error);
    }

    // Force kill after timeout
    setTimeout(() => {
      if (this.apiProcess && !this.apiProcess.killed) {
        // Force killing API server
        try {
          this.apiProcess.kill('SIGKILL');
        } catch (error) {
          console.error('Error sending SIGKILL to API server:', error);
        }
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