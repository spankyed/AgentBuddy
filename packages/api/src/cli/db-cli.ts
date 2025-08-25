#!/usr/bin/env node
import repl from 'node:repl';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { inspect } from 'node:util';
import { qx } from '@/core/utils/ears/helpers/query';
import { tx } from '@/core/utils/ears/helpers/transaction';
import { EARS } from '@/core/types';
import { 
  getAllEntities, 
  getEntitiesOfType, 
  getAttr, 
  getAttrs,
  getRoles,
  getAll
} from '@/core/utils/ears/attribute-storage';
import { formatResult, exportToJSON, exportToCSV, confirmAction } from './utils';

export interface CliOptions {
  mode?: 'interactive' | 'exec' | 'script';
  command?: string;
  scriptPath?: string;
  output?: 'json' | 'csv' | 'pretty';
  outputFile?: string;
  confirm?: boolean;
  verbose?: boolean;
}

export class DatabaseCLI {
  private replServer?: repl.REPLServer;
  private options: CliOptions;
  private history: string[] = [];

  constructor(options: CliOptions = {}) {
    this.options = {
      mode: 'interactive',
      output: 'pretty',
      confirm: true,
      verbose: false,
      ...options
    };
  }

  async start() {
    switch (this.options.mode) {
      case 'exec':
        await this.executeCommand(this.options.command!);
        break;
      case 'script':
        await this.executeScript(this.options.scriptPath!);
        break;
      case 'interactive':
      default:
        await this.startInteractive();
        break;
    }
  }

  private async startInteractive() {
    console.log('🗄️  AgentBuddy Database CLI');
    console.log('─'.repeat(50));
    console.log('Available commands:');
    console.log('  qx()    - Query builder');
    console.log('  tx()    - Transaction builder');
    console.log('  EARS    - Entity/Attribute/Relation types');
    console.log('  .help   - Show this help');
    console.log('  .export - Export last result');
    console.log('  .clear  - Clear screen');
    console.log('  .exit   - Exit CLI');
    console.log('─'.repeat(50));
    console.log();

    this.replServer = repl.start({
      prompt: 'db> ',
      eval: this.evalCommand.bind(this),
      writer: this.formatOutput.bind(this),
      ignoreUndefined: true,
      useGlobal: true,
      breakEvalOnSigint: true
    });

    // Add context
    this.setupContext();

    // Add custom commands
    this.addCustomCommands();

    // Load history
    this.loadHistory();

    // Save history on exit
    this.replServer.on('exit', () => {
      this.saveHistory();
      console.log('\n👋 Goodbye!');
      process.exit(0);
    });
  }

  private setupContext() {
    if (!this.replServer) return;

    const context = this.replServer.context;

    // Core functions
    context.qx = qx;
    context.tx = tx;
    context.EARS = EARS;

    // Helper functions
    context.getAllEntities = getAllEntities;
    context.getEntitiesOfType = getEntitiesOfType;
    context.getAttr = getAttr;
    context.getAttrs = getAttrs;
    context.getRoles = getRoles;
    context.getAll = getAll;

    // Utility functions
    context.count = (result: any) => {
      if (Array.isArray(result)) return result.length;
      if (result && typeof result === 'object') return Object.keys(result).length;
      return 0;
    };

    context.first = (result: any) => Array.isArray(result) ? result[0] : result;
    context.last = (result: any) => Array.isArray(result) ? result[result.length - 1] : result;

    // Store last result for export
    context._lastResult = null;
  }

  private addCustomCommands() {
    if (!this.replServer) return;

    this.replServer.defineCommand('export', {
      help: 'Export last result to file',
      action: async (filename) => {
        const context = this.replServer!.context;
        if (!context._lastResult) {
          console.log('No result to export');
          return;
        }

        const file = filename.trim() || `export-${Date.now()}.json`;
        const format = path.extname(file).slice(1) as 'json' | 'csv';

        try {
          if (format === 'csv') {
            await exportToCSV(context._lastResult, file);
          } else {
            await exportToJSON(context._lastResult, file);
          }
          console.log(`✅ Exported to ${file}`);
        } catch (error) {
          console.error('Export failed:', error);
        }
        this.replServer!.displayPrompt();
      }
    });

    this.replServer.defineCommand('clear', {
      help: 'Clear the screen',
      action: () => {
        console.clear();
        this.replServer!.displayPrompt();
      }
    });

    this.replServer.defineCommand('stats', {
      help: 'Show database statistics',
      action: () => {
        const stats = {
          totalEntities: getAllEntities().length,
          byType: {} as Record<string, number>
        };

        for (const entityType of Object.values(EARS.Entity)) {
          const count = getEntitiesOfType(entityType).length;
          if (count > 0) {
            stats.byType[entityType] = count;
          }
        }

        console.log('\n📊 Database Statistics:');
        console.log('─'.repeat(30));
        console.log(`Total Entities: ${stats.totalEntities}`);
        console.log('\nBy Type:');
        for (const [type, count] of Object.entries(stats.byType)) {
          console.log(`  ${type}: ${count}`);
        }
        console.log();
        this.replServer!.displayPrompt();
      }
    });

    this.replServer.defineCommand('help', {
      help: 'Show help',
      action: () => {
        console.log('\n📖 Help:');
        console.log('─'.repeat(30));
        console.log('Query Examples:');
        console.log('  qx(EARS.Entity.Settings).pickAll()');
        console.log('  qx("Settings-123").pick(["name", "value"])');
        console.log('  qx().ofType(EARS.Entity.Document).count()');
        console.log('\nTransaction Examples:');
        console.log('  tx(EARS.Entity.Settings).put("key", "value")');
        console.log('  tx("Settings-123").destroy()');
        console.log('\nCommands:');
        console.log('  .help   - Show this help');
        console.log('  .stats  - Show database statistics');
        console.log('  .export - Export last result');
        console.log('  .clear  - Clear screen');
        console.log('  .exit   - Exit CLI');
        console.log();
        this.replServer!.displayPrompt();
      }
    });
  }

  private async evalCommand(
    cmd: string,
    context: any,
    filename: string,
    callback: (err: Error | null, result?: any) => void
  ) {
    try {
      // Check for destructive operations
      if (this.options.confirm && this.isDestructive(cmd)) {
        const confirmed = await confirmAction(
          `This operation may modify data. Continue?`
        );
        if (!confirmed) {
          callback(null, 'Operation cancelled');
          return;
        }
      }

      // Use default eval with async support
      // Create an async function to evaluate the command
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
      const fn = new AsyncFunction('qx', 'tx', 'EARS', 'getAllEntities', 'getEntitiesOfType', 'getAttr', 'getAttrs', 'getRoles', 'getAll', `
        return (async () => {
          ${cmd}
        })();
      `);

      const result = await fn(qx, tx, EARS, getAllEntities, getEntitiesOfType, getAttr, getAttrs, getRoles, getAll);
      
      // Store result for export
      context._lastResult = result;
      
      // Add to history
      if (cmd.trim() && !cmd.startsWith('.')) {
        this.history.push(cmd.trim());
      }

      callback(null, result);
    } catch (error) {
      callback(error as Error);
    }
  }

  private formatOutput(output: any): string {
    if (this.options.output === 'json') {
      return JSON.stringify(output, null, 2);
    }

    if (output === undefined) return '';
    
    return formatResult(output);
  }

  private isDestructive(cmd: string): boolean {
    const destructivePatterns = [
      /\.destroy\(\)/,
      /\.drop\(/,
      /\.revoke\(/,
      /\.unlink\(/,
      /\.clear\(/,
      /dropAttr\(/,
      /destroyEntity\(/,
      /removeRelation\(/
    ];

    return destructivePatterns.some(pattern => pattern.test(cmd));
  }

  async executeCommand(command: string) {
    if (!command) {
      console.error('No command provided');
      process.exit(1);
    }

    try {
      // Check for destructive operations
      if (this.options.confirm && this.isDestructive(command)) {
        const confirmed = await confirmAction(
          `This operation may modify data. Continue?`
        );
        if (!confirmed) {
          console.log('Operation cancelled');
          process.exit(0);
        }
      }

      // Create context
      const context = {
        qx,
        tx,
        EARS,
        getAllEntities,
        getEntitiesOfType,
        getAttr,
        getAttrs,
        getRoles,
        getAll,
        console,
        process
      };

      // Execute command with eval for ES module compatibility
      const result = await eval(`
        (async () => {
          const { qx, tx, EARS, getAllEntities, getEntitiesOfType, getAttr, getAttrs, getRoles, getAll } = context;
          ${command}
        })()
      `);

      // Output result
      if (result !== undefined) {
        if (this.options.outputFile) {
          const format = this.options.output || 'json';
          if (format === 'csv') {
            await exportToCSV(result, this.options.outputFile);
          } else {
            await exportToJSON(result, this.options.outputFile);
          }
          console.log(`✅ Result exported to ${this.options.outputFile}`);
        } else {
          console.log(this.formatOutput(result));
        }
      }
    } catch (error) {
      console.error('Error executing command:', error);
      process.exit(1);
    }
  }

  async executeScript(scriptPath: string) {
    if (!fs.existsSync(scriptPath)) {
      console.error(`Script file not found: ${scriptPath}`);
      process.exit(1);
    }

    try {
      const scriptContent = fs.readFileSync(scriptPath, 'utf-8');
      
      // Check for destructive operations
      if (this.options.confirm && this.isDestructive(scriptContent)) {
        const confirmed = await confirmAction(
          `This script may modify data. Continue?`
        );
        if (!confirmed) {
          console.log('Script execution cancelled');
          process.exit(0);
        }
      }

      console.log(`Executing script: ${scriptPath}`);
      await this.executeCommand(scriptContent);
    } catch (error) {
      console.error('Error executing script:', error);
      process.exit(1);
    }
  }

  private loadHistory() {
    const historyFile = path.join(process.env.HOME || '.', '.agentbuddy_db_history');
    if (fs.existsSync(historyFile)) {
      try {
        const history = fs.readFileSync(historyFile, 'utf-8').split('\n').filter(Boolean);
        this.history = history.slice(-100); // Keep last 100 commands
        
        if (this.replServer) {
          history.forEach(cmd => {
            this.replServer!.history.push(cmd);
          });
        }
      } catch (error) {
        // Ignore history load errors
      }
    }
  }

  private saveHistory() {
    const historyFile = path.join(process.env.HOME || '.', '.agentbuddy_db_history');
    try {
      fs.writeFileSync(historyFile, this.history.slice(-100).join('\n'));
    } catch (error) {
      // Ignore history save errors
    }
  }
}

// Export for use in other modules
export { qx, tx, EARS };