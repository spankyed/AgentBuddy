import { ChildProcess } from 'child_process';
import { BrowserWindow, app } from 'electron';
import { API_EVENTS } from './config.js';
import { logInfo, logError } from './logger.js';

export interface ProcessHandlers {
  onReady?: (port: number) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
  onError?: (error: Error) => void;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export class ProcessManager {
  private process?: ChildProcess;
  private handlers: ProcessHandlers;
  private serverReady = false;
  private lastStderr = '';

  constructor(handlers: ProcessHandlers = {}) {
    this.handlers = handlers;
  }

  setProcess(process: ChildProcess): void {
    this.process = process;
    this.serverReady = false;
    this.lastStderr = '';
    this.attachHandlers();
  }

  private attachHandlers(): void {
    if (!this.process) return;

    // Stdout handling
    if (this.process.stdout) {
      this.process.stdout.on('data', (data) => {
        const message = data.toString();
        const isDev = !app.isPackaged;
        
        // Log critical startup messages even in production
        const isCriticalMessage = message.includes('WebSocket Server listening') || 
                                  message.includes('ERROR') || 
                                  message.includes('Failed') ||
                                  message.includes('Server started');
        
        // Log and broadcast in development mode or for critical messages
        if (isDev || isCriticalMessage) {
          // Log to main process console
          console.log(`[API Server]: ${message.trim()}`);
          
          // Broadcast stdout to renderer in dev mode
          if (isDev) {
            broadcastEvent(API_EVENTS.LOG, { 
              type: 'stdout', 
              message,
              timestamp: new Date().toISOString()
            });
          }
        }
        
        // Check for server ready message (only trigger once)
        if (!this.serverReady && message.includes('WebSocket Server listening')) {
          const portMatch = message.match(/ws:\/\/localhost:(\d+)/);
          if (portMatch && this.handlers.onReady) {
            const port = parseInt(portMatch[1], 10);
            this.serverReady = true;
            this.handlers.onReady(port);
          }
        }

        this.handlers.onStdout?.(message);
      });

      this.process.stdout.on('error', (error) => {
        console.error('Process stdout error:', error);
      });
    }

    // Stderr handling
    if (this.process.stderr) {
      this.process.stderr.on('data', (data) => {
        const message = data.toString();
        const isDev = !app.isPackaged;
        this.lastStderr = message.trim();

        // Always log errors in production for debugging
        logError(`[API Server Error]: ${message.trim()}`);

        // Broadcast stderr to renderer in dev mode
        if (isDev) {
          broadcastEvent(API_EVENTS.LOG, { 
            type: 'stderr', 
            message,
            timestamp: new Date().toISOString()
          });
        }
        
        this.handlers.onStderr?.(message);
      });

      this.process.stderr.on('error', (error) => {
        console.error('Process stderr error:', error);
      });
    }

    // Process exit handling
    this.process.on('exit', (code, signal) => {
      console.log(`Process exited with code ${code} and signal ${signal}`);
      this.handlers.onExit?.(code, signal);
    });

    // Process error handling
    this.process.on('error', (error) => {
      console.error('Process error:', error);
      this.handlers.onError?.(error);
    });
  }

  cleanup(): void {
    if (!this.process) return;

    // Remove all listeners
    this.process.stdout?.removeAllListeners();
    this.process.stderr?.removeAllListeners();
    this.process.removeAllListeners();

    // Destroy streams
    this.process.stdout?.destroy();
    this.process.stderr?.destroy();
  }

  kill(signal: NodeJS.Signals = 'SIGTERM', forceKillDelay = 5000): void {
    if (!this.process) return;

    this.cleanup();

    try {
      this.process.kill(signal);
    } catch (error) {
      console.error(`Error sending ${signal}:`, error);
    }

    // Force kill after delay if needed
    if (forceKillDelay > 0) {
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          try {
            this.process.kill('SIGKILL');
          } catch (error) {
            console.error('Error sending SIGKILL:', error);
          }
        }
      }, forceKillDelay);
    }
  }

  isRunning(): boolean {
    return !!this.process && !this.process.killed;
  }

  getPid(): number | undefined {
    return this.process?.pid;
  }

  getLastStderr(): string {
    return this.lastStderr;
  }
}

// Event broadcaster utility
export function broadcastEvent(event: string, data?: any): void {
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send(event, data);
  });
}