import { ChildProcess } from 'child_process';
import { BrowserWindow } from 'electron';

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

  constructor(handlers: ProcessHandlers = {}) {
    this.handlers = handlers;
  }

  setProcess(process: ChildProcess): void {
    this.process = process;
    this.serverReady = false;
    this.attachHandlers();
  }

  private attachHandlers(): void {
    if (!this.process) return;

    // Stdout handling
    if (this.process.stdout) {
      this.process.stdout.on('data', (data) => {
        const message = data.toString();
        
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
        console.error(`[API Server Error]: ${message}`);
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
}

// Event broadcaster utility
export function broadcastEvent(event: string, data?: any): void {
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send(event, data);
  });
}