import { ChildProcess } from 'child_process';
import { BrowserWindow, app } from 'electron';
import { API_EVENTS } from './config.ts';
import { logInfo, logError } from './logger.ts';

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
  private exited = false;
  private lastStderr = '';
  private fatalErrors: { message: string; stack?: string; source?: string }[] = [];

  constructor(handlers: ProcessHandlers = {}) {
    this.handlers = handlers;
  }

  setProcess(process: ChildProcess): void {
    this.process = process;
    this.serverReady = false;
    this.exited = false;
    this.lastStderr = '';
    this.fatalErrors = [];
    this.attachHandlers();
  }

  private attachHandlers(): void {
    if (!this.process) return;

    // Stdout handling
    if (this.process.stdout) {
      this.process.stdout.on('data', (data) => {
        const message = data.toString();
        const isDev = !app.isPackaged;
        
        // Log all API stdout in production so backend lifecycle context is not lost.
        if (app.isPackaged && message.trim()) {
          logInfo(`[API Server stdout]: ${message.trim()}`);
        }

        // Log and broadcast stdout in development mode.
        if (isDev) {
          logInfo(`[API Server]: ${message.trim()}`);

          // Broadcast stdout to renderer in dev mode
          broadcastEvent(API_EVENTS.LOG, {
            type: 'stdout',
            message,
            timestamp: new Date().toISOString()
          });
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

        // Check for structured fatal error JSON line from backend
        for (const line of message.split('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('{"__fatal":')) {
            try {
              const parsed = JSON.parse(trimmed);
              if (parsed.__fatal) {
                this.fatalErrors.push({ message: parsed.message, stack: parsed.stack, source: parsed.source });
                broadcastEvent('api:fatal', { message: parsed.message, stack: parsed.stack, source: parsed.source });
              }
            } catch { /* not valid JSON, ignore */ }
          }
        }

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
      this.exited = true;
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

  /**
   * Ends the process and resolves once it is **gone**, not once the signal was sent.
   *
   * **Waiting is what a reload needs and a quit does not.** The departing API holds the port the next one
   * prefers and the LMDB store it is about to open, so starting the replacement before it lets go of
   * either is the failure this exists to prevent.
   *
   * **The order is the method.** `cleanup()` removes *every* listener, so the waiter goes on after it and
   * the signal after that: before, and it is stripped with the handlers it replaces. Stripping them first
   * is also what keeps this off `onExit`, so a reload is never counted as a crash.
   *
   * A process that ignores the signal and survives the force-kill still gets an answer; hanging is not one.
   */
  stop(signal: NodeJS.Signals = 'SIGTERM', forceKillDelay = 5000): Promise<void> {
    const child = this.process;
    if (!child || this.exited) return Promise.resolve();
    this.cleanup();

    let gone = false;
    const signalling = new Promise<void>((resolve) => {
      const done = (): void => {
        gone = true;
        // `cleanup()` took the handler that normally sets this, and `isRunning()` reads it
        this.exited = true;
        clearTimeout(giveUp);
        resolve();
      };
      const giveUp = setTimeout(() => {
        child.removeListener('exit', done);
        resolve();
      }, forceKillDelay + 1000);
      child.once('exit', done);
    });

    this.signal(child, signal);
    // **`gone`, never `child.killed`.** That flag means "a signal was delivered", not "the process ended",
    // so it is already true here — a force-kill guarded on it can never fire, which is what this one did.
    if (forceKillDelay > 0) setTimeout(() => { if (!gone) this.signal(child, 'SIGKILL'); }, forceKillDelay);
    return signalling;
  }

  /** Fire and forget, for the callers that cannot await — `before-quit` and `window-all-closed`. */
  kill(signal: NodeJS.Signals = 'SIGTERM', forceKillDelay = 5000): void {
    void this.stop(signal, forceKillDelay);
  }

  private signal(child: ChildProcess, signal: NodeJS.Signals): void {
    try {
      child.kill(signal);
    } catch (error) {
      logError(`[MAIN] Error sending ${signal} to the API:`, error);
    }
  }

  isRunning(): boolean {
    return !!this.process && !this.process.killed && !this.exited;
  }

  getPid(): number | undefined {
    return this.process?.pid;
  }

  getLastStderr(): string {
    return this.lastStderr;
  }

  getFatalErrors(): { message: string; stack?: string; source?: string }[] {
    return this.fatalErrors;
  }
}

// Event broadcaster utility
export function broadcastEvent(event: string, data?: any): void {
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send(event, data);
  });
}
