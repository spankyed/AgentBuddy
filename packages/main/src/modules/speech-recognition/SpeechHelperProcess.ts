import { ChildProcess, spawn } from 'child_process';
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import type { SpeechCommand, SpeechEvent } from './protocol.js';

export class SpeechHelperProcess {
  private process: ChildProcess | null = null;
  private stdoutBuffer = '';
  private onEvent: (event: SpeechEvent) => void;

  constructor(onEvent: (event: SpeechEvent) => void) {
    this.onEvent = onEvent;
  }

  static getHelperPath(): string | null {
    const platform = process.platform;

    if (app.isPackaged) {
      if (platform === 'darwin') return path.join(process.resourcesPath, 'native/speech/SpeechHelper');
      if (platform === 'win32') return path.join(process.resourcesPath, 'native/speech/SpeechHelper.ps1');
    } else {
      // Development: project root
      const root = app.getAppPath();
      if (platform === 'darwin') return path.join(root, 'native/speech/macos/SpeechHelper');
      if (platform === 'win32') return path.join(root, 'native/speech/windows/SpeechHelper.ps1');
    }

    return null;
  }

  static isAvailable(): boolean {
    const helperPath = SpeechHelperProcess.getHelperPath();
    if (!helperPath) return false;
    return fs.existsSync(helperPath);
  }

  spawn(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.process) {
        resolve();
        return;
      }

      const helperPath = SpeechHelperProcess.getHelperPath();
      if (!helperPath) {
        reject(new Error('Speech helper not available on this platform'));
        return;
      }

      if (!fs.existsSync(helperPath)) {
        reject(new Error(`Speech helper not found at ${helperPath}`));
        return;
      }

      const platform = process.platform;

      if (platform === 'darwin') {
        this.process = spawn(helperPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
      } else if (platform === 'win32') {
        this.process = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', helperPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } else {
        reject(new Error('Unsupported platform'));
        return;
      }

      const originalOnEvent = this.onEvent;
      let settled = false;
      let readyTimeout: ReturnType<typeof setTimeout>;

      const cleanup = () => {
        clearTimeout(readyTimeout);
        this.onEvent = originalOnEvent;
        this.process?.removeListener('exit', onEarlyExit);
      };

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        this.kill();
        reject(err);
      };

      const onEarlyExit = () => fail(new Error('Speech helper exited before becoming ready'));

      // macOS waits for user-interactive permission dialogs (speech + microphone) before emitting ready
      const readyTimeoutMs = process.platform === 'darwin' ? 60_000 : 10_000;
      readyTimeout = setTimeout(() => fail(new Error('Speech helper did not become ready in time')), readyTimeoutMs);

      this.process.on('error', (err) => {
        console.error('[SpeechHelper] Process error:', err);
        if (!settled) {
          fail(err);
        } else {
          this.process = null;
        }
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[SpeechHelper] Exited with code ${code}, signal ${signal}`);
        if (!settled) {
          onEarlyExit();
        } else {
          this.process = null;
        }
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`[SpeechHelper] stderr: ${data.toString().trim()}`);
      });

      this.process.stdout?.on('data', (data) => {
        this.stdoutBuffer += data.toString();
        const lines = this.stdoutBuffer.split('\n');
        this.stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const event: SpeechEvent = JSON.parse(trimmed);
            this.onEvent(event);
          } catch {
            console.warn('[SpeechHelper] Non-JSON stdout:', trimmed);
          }
        }
      });

      this.onEvent = (event) => {
        if (event.event === 'ready') {
          if (settled) return;
          settled = true;
          cleanup();
          this.onEvent(event); // forward the ready event via restored handler
          resolve();
        } else {
          originalOnEvent(event);
        }
      };
    });
  }

  sendCommand(cmd: SpeechCommand): void {
    if (!this.process?.stdin?.writable) {
      console.warn('[SpeechHelper] Cannot send command, process not running');
      return;
    }
    this.process.stdin.write(JSON.stringify(cmd) + '\n');
  }

  kill(): void {
    if (!this.process) return;

    try {
      this.process.stdin?.end();
      this.process.kill('SIGTERM');
    } catch (err) {
      console.error('[SpeechHelper] Error killing process:', err);
    }

    this.process = null;
    this.stdoutBuffer = '';
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
