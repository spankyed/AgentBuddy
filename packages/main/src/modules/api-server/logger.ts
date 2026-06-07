import log from 'electron-log/main';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// Match previous 10MB rotation limit
log.transports.file.maxSize = 10 * 1024 * 1024;

export function logInfo(...args: any[]): void {
  log.info(...args);
}

export function logError(...args: any[]): void {
  log.error(...args);
}

export function logWarn(...args: any[]): void {
  log.warn(...args);
}

function formatRendererArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack || arg.message;
  }
  if (typeof arg === 'string') {
    return arg;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function getRendererLogPath(): string {
  return path.join(path.dirname(log.transports.file.getFile().path), 'renderer.log');
}

export function logRenderer(level: 'debug' | 'info' | 'warn' | 'error', ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const message = args.length > 0 ? args.map(formatRendererArg).join(' ') : '';
  const line = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;
  fs.mkdirSync(path.dirname(getRendererLogPath()), { recursive: true });
  fs.appendFileSync(getRendererLogPath(), line);
}

export function logRendererFatal(summary: string, ...args: unknown[]): void {
  logRenderer('error', summary, ...args);
  logError(`[RENDERER] ${summary}`, ...args);
}

export function logStartupBanner(): void {
  log.info('='.repeat(60));
  log.info(`AgentBuddy Started: ${new Date().toISOString()}`);
  log.info(`Version: ${app.getVersion()}`);
  log.info(`Platform: ${process.platform}`);
  log.info(`Electron: ${process.versions.electron}`);
  log.info(`Node: ${process.versions.node}`);
  log.info('='.repeat(60));
}

// Singleton-shaped object preserving the getLogPath() contract used by ApiServer
export function getLogger() {
  return {
    getLogPath: () => log.transports.file.getFile().path,
    getRendererLogPath,
    log: logInfo,
    error: logError,
    warn: logWarn,
  };
}
