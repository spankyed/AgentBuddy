import log from 'electron-log/main';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// Match previous 10MB rotation limit
log.transports.file.maxSize = 10 * 1024 * 1024;

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

let mainConsoleCaptureInstalled = false;

export function initializeMainLogCapture(): void {
  if (mainConsoleCaptureInstalled) return;
  mainConsoleCaptureInstalled = true;

  console.log = (...args: unknown[]) => {
    appendStructuredLog('main.jsonl', 'info', args);
    log.info(...args);
    originalConsole.log(...args);
  };
  console.info = (...args: unknown[]) => {
    appendStructuredLog('main.jsonl', 'info', args);
    log.info(...args);
    originalConsole.info(...args);
  };
  console.warn = (...args: unknown[]) => {
    appendStructuredLog('main.jsonl', 'warn', args);
    log.warn(...args);
    originalConsole.warn(...args);
  };
  console.error = (...args: unknown[]) => {
    appendStructuredLog('main.jsonl', 'error', args);
    log.error(...args);
    originalConsole.error(...args);
  };
  console.debug = (...args: unknown[]) => {
    appendStructuredLog('main.jsonl', 'debug', args);
    log.debug(...args);
    originalConsole.debug(...args);
  };
}

export function logInfo(...args: any[]): void {
  appendStructuredLog('main.jsonl', 'info', args);
  log.info(...args);
}

export function logError(...args: any[]): void {
  appendStructuredLog('main.jsonl', 'error', args);
  log.error(...args);
}

export function logWarn(...args: any[]): void {
  appendStructuredLog('main.jsonl', 'warn', args);
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

function appendStructuredLog(fileName: string, level: string, args: unknown[]): void {
  try {
    const logPath = log.transports.file.getFile().path;
    const logDir = path.dirname(logPath);
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, fileName), JSON.stringify({
      timestamp: new Date().toISOString(),
      startupId: process.env.AGENTBUDDY_STARTUP_ID,
      level,
      message: args.map(formatRendererArg).join(' '),
      args,
    }) + '\n');
  } catch {
    // Logging must never break the app.
  }
}

export function getRendererLogPath(): string {
  return path.join(path.dirname(log.transports.file.getFile().path), 'renderer.log');
}

export function getAppEventsLogPath(): string {
  return path.join(path.dirname(log.transports.file.getFile().path), 'app-events.log');
}

export function logRenderer(level: 'debug' | 'info' | 'warn' | 'error', ...args: unknown[]): void {
  const timestamp = new Date().toISOString();
  const message = args.length > 0 ? args.map(formatRendererArg).join(' ') : '';
  const line = `[${timestamp}] ${level.toUpperCase()}: ${message}\n`;
  fs.mkdirSync(path.dirname(getRendererLogPath()), { recursive: true });
  fs.appendFileSync(getRendererLogPath(), line);
  appendStructuredLog('renderer.jsonl', level, args);
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
    getAppEventsLogPath,
    log: logInfo,
    error: logError,
    warn: logWarn,
  };
}
