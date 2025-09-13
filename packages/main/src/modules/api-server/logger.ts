import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

class ProductionLogger {
  private logPath: string;
  private logStream: fs.WriteStream | null = null;
  private readonly maxLogSize = 10 * 1024 * 1024; // 10MB

  constructor() {
    const userDataPath = app.getPath('userData');
    this.logPath = path.join(userDataPath, 'agentbuddy.log');
    this.initLogStream();
  }

  private initLogStream(): void {
    try {
      // Check if log file needs rotation
      if (fs.existsSync(this.logPath)) {
        const stats = fs.statSync(this.logPath);
        if (stats.size > this.maxLogSize) {
          // Rotate log file
          const backupPath = `${this.logPath}.${Date.now()}.bak`;
          fs.renameSync(this.logPath, backupPath);
        }
      }

      // Create write stream with append flag
      this.logStream = fs.createWriteStream(this.logPath, { flags: 'a' });
      
      // Write startup header
      this.write('='.repeat(60));
      this.write(`AgentBuddy Started: ${new Date().toISOString()}`);
      this.write(`Version: ${app.getVersion()}`);
      this.write(`Packaged: ${app.isPackaged}`);
      this.write(`Platform: ${process.platform}`);
      this.write(`Electron: ${process.versions.electron}`);
      this.write(`Node: ${process.versions.node}`);
      this.write('='.repeat(60));
    } catch (error) {
      console.error('Failed to initialize log stream:', error);
    }
  }

  private write(message: string): void {
    if (!this.logStream) return;
    
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    this.logStream.write(logEntry);
    
    // Also write to console
    if (message.includes('ERROR')) {
      console.error(logEntry.trim());
    } else {
      console.log(logEntry.trim());
    }
  }

  log(...args: any[]): void {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    this.write(`INFO: ${message}`);
  }

  error(...args: any[]): void {
    const message = args.map(arg => {
      if (arg instanceof Error) {
        return `${arg.message}\nStack: ${arg.stack}`;
      }
      return typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg);
    }).join(' ');
    this.write(`ERROR: ${message}`);
    
    // Force flush on errors
    if (this.logStream) {
      this.logStream.write('', () => {});  // Flush the stream
    }
  }

  warn(...args: any[]): void {
    const message = args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ');
    this.write(`WARN: ${message}`);
  }

  close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  getLogPath(): string {
    return this.logPath;
  }
}

// Singleton instance
let logger: ProductionLogger | null = null;

export function getLogger(): ProductionLogger {
  if (!logger) {
    logger = new ProductionLogger();
  }
  return logger;
}

// Export convenience functions
export function logInfo(...args: any[]): void {
  getLogger().log(...args);
}

export function logError(...args: any[]): void {
  getLogger().error(...args);
}

export function logWarn(...args: any[]): void {
  getLogger().warn(...args);
}