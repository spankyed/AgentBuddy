import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ApiServer implements AppModule {
  private apiProcess?: ChildProcess;
  private isShuttingDown = false;
  private restartAttempts = 0;
  private readonly maxRestartAttempts = 3;
  private readonly restartDelay = 2000; // 2 seconds

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

  private startApiServer(): void {
    if (this.apiProcess) {
      console.log('API server already running');
      return;
    }

    console.log('Starting API server...');

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
        }
      });
    } else {
      // In production, assume the API is already built
      apiPath = path.join(process.resourcesPath, 'api');
      this.launchApiServer(apiPath);
    }
  }

  private launchApiServer(apiPath: string): void {
    // Spawn the API server process
    this.apiProcess = spawn('node', ['dist/server.js'], {
      cwd: apiPath,
      env: {
        ...process.env,
        NODE_ENV: app.isPackaged ? 'production' : 'development',
        API_PORT: '3001',
        DATABASE_PATH: path.join(app.getPath('userData'), 'database.db')
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Handle stdout
    this.apiProcess.stdout?.on('data', (data) => {
      console.log(`[API Server]: ${data.toString()}`);
    });

    // Handle stderr
    this.apiProcess.stderr?.on('data', (data) => {
      console.error(`[API Server Error]: ${data.toString()}`);
    });

    // Handle process exit
    this.apiProcess.on('exit', (code, signal) => {
      console.log(`API server exited with code ${code} and signal ${signal}`);
      this.apiProcess = undefined;

      // Attempt to restart unless we're shutting down
      if (!this.isShuttingDown && this.restartAttempts < this.maxRestartAttempts) {
        this.restartAttempts++;
        console.log(`Attempting to restart API server (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`);
        
        setTimeout(() => {
          this.startApiServer();
        }, this.restartDelay);
      } else if (this.restartAttempts >= this.maxRestartAttempts) {
        console.error('Max restart attempts reached. API server will not be restarted.');
      }
    });

    // Handle process errors
    this.apiProcess.on('error', (error) => {
      console.error('Failed to start API server:', error);
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
}

// Factory function for consistency with other modules
export function createApiServer(): ApiServer {
  return new ApiServer();
}