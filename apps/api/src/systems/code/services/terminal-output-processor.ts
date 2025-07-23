import stripAnsi from 'strip-ansi'

export interface ProcessedCommand {
  command: string
  output: string
  timestamp: number
}

export interface ProcessedTerminalData {
  commands: ProcessedCommand[]
  currentBuffer: string[]
  lastCommand: string | null
}

export class TerminalOutputProcessor {
  private static readonly MAX_BUFFER_LINES = 1000
  private static readonly MAX_COMMANDS = 100
  private static readonly MAX_OUTPUT_LENGTH = 10000 // Max chars per command output
  
  private commands: ProcessedCommand[] = []
  private currentBuffer: string[] = []
  private lastCommand: string | null = null
  private currentOutput: string = ''
  private commandRegex = /^[$#] (.+)$/m
  
  /**
   * Process raw terminal output and extract commands and their outputs
   */
  processOutput(rawData: string): void {
    // Strip ANSI codes
    const cleanData = stripAnsi(rawData)
    
    // Handle carriage returns by keeping only the last occurrence
    const lines = cleanData.split('\n').map(line => {
      // Handle \r by keeping only the part after the last \r
      const parts = line.split('\r')
      return parts[parts.length - 1]
    })
    
    // Process each line
    for (const line of lines) {
      if (!line.trim()) continue
      
      // Check if this line is a command prompt
      const commandMatch = line.match(this.commandRegex)
      if (commandMatch) {
        // Save previous command if exists
        if (this.lastCommand && this.currentOutput.trim()) {
          this.saveCommand(this.lastCommand, this.currentOutput.trim())
        }
        
        // Start tracking new command
        this.lastCommand = commandMatch[1]
        this.currentOutput = ''
      } else {
        // Accumulate output
        this.currentOutput += line + '\n'
      }
      
      // Add to buffer
      this.addToBuffer(line)
    }
  }
  
  /**
   * Get the processed terminal data
   */
  getProcessedData(): ProcessedTerminalData {
    // Save any pending command
    if (this.lastCommand && this.currentOutput.trim()) {
      this.saveCommand(this.lastCommand, this.currentOutput.trim())
      this.lastCommand = null
      this.currentOutput = ''
    }
    
    return {
      commands: [...this.commands],
      currentBuffer: [...this.currentBuffer],
      lastCommand: this.lastCommand
    }
  }
  
  /**
   * Get a compact summary for storage
   */
  getStorageSummary(): string {
    const data = this.getProcessedData()
    
    // Format commands for storage
    const commandSummary = data.commands
      .slice(-20) // Keep last 20 commands
      .map(cmd => `$ ${cmd.command}\n${cmd.output.substring(0, 500)}`)
      .join('\n\n')
    
    return commandSummary
  }
  
  /**
   * Restore from stored data
   */
  static fromStoredData(storedData: string): TerminalOutputProcessor {
    const processor = new TerminalOutputProcessor()
    
    // Parse stored commands (simplified - in production you'd want more robust parsing)
    const commandBlocks = storedData.split('\n\n')
    for (const block of commandBlocks) {
      if (block.startsWith('$ ')) {
        const lines = block.split('\n')
        const command = lines[0].substring(2)
        const output = lines.slice(1).join('\n')
        processor.commands.push({
          command,
          output,
          timestamp: Date.now()
        })
      }
    }
    
    return processor
  }
  
  private saveCommand(command: string, output: string): void {
    // Limit output length
    const truncatedOutput = output.length > TerminalOutputProcessor.MAX_OUTPUT_LENGTH
      ? output.substring(0, TerminalOutputProcessor.MAX_OUTPUT_LENGTH) + '\n... (truncated)'
      : output
    
    this.commands.push({
      command,
      output: truncatedOutput,
      timestamp: Date.now()
    })
    
    // Keep only recent commands
    if (this.commands.length > TerminalOutputProcessor.MAX_COMMANDS) {
      this.commands = this.commands.slice(-TerminalOutputProcessor.MAX_COMMANDS)
    }
  }
  
  private addToBuffer(line: string): void {
    this.currentBuffer.push(line)
    
    // Maintain buffer size
    if (this.currentBuffer.length > TerminalOutputProcessor.MAX_BUFFER_LINES) {
      this.currentBuffer = this.currentBuffer.slice(-TerminalOutputProcessor.MAX_BUFFER_LINES)
    }
  }
}