import { describe, it, expect } from 'vitest'
import { TerminalOutputProcessor } from '@/systems/code/services/terminal-output-processor'

describe('TerminalOutputProcessor', () => {
  it('should strip ANSI codes and extract commands', () => {
    const processor = new TerminalOutputProcessor()
    
    // Simulate terminal output with ANSI codes
    const rawOutput = '\u001b[1m\u001b[32m$ ls -la\u001b[0m\n' +
      'total 16\n' +
      'drwxr-xr-x  4 user  staff   128 Dec  1 10:00 .\n' +
      'drwxr-xr-x 10 user  staff   320 Dec  1 09:00 ..\n' +
      '\u001b[1m\u001b[32m$ pwd\u001b[0m\n' +
      '/Users/user/project\n'
    
    processor.processOutput(rawOutput)
    const data = processor.getProcessedData()
    
    expect(data.commands).toHaveLength(2) // Both commands are saved
    expect(data.commands[0].command).toBe('ls -la')
    expect(data.commands[0].output).toContain('total 16')
    expect(data.commands[1].command).toBe('pwd')
    expect(data.commands[1].output).toContain('/Users/user/project')
  })
  
  it('should handle carriage returns properly', () => {
    const processor = new TerminalOutputProcessor()
    
    // Output with carriage returns (common in progress indicators)
    const rawOutput = '$ npm install\n' +
      'Progress: 10%\rProgress: 50%\rProgress: 100%\n' +
      'Done!\n'
    
    processor.processOutput(rawOutput)
    const data = processor.getProcessedData()
    
    expect(data.currentBuffer).toContain('Progress: 100%') // Only last after \r
    expect(data.currentBuffer).not.toContain('Progress: 10%')
  })
  
  it('should limit output length and command count', () => {
    const processor = new TerminalOutputProcessor()
    
    // Generate many commands
    for (let i = 0; i < 150; i++) {
      processor.processOutput(`$ command${i}\noutput${i}\n`)
    }
    
    const data = processor.getProcessedData()
    expect(data.commands.length).toBeLessThanOrEqual(100) // MAX_COMMANDS
  })
  
  it('should generate storage summary', () => {
    const processor = new TerminalOutputProcessor()
    
    processor.processOutput('$ echo "Hello World"\nHello World\n')
    processor.processOutput('$ ls\nfile1.txt\nfile2.txt\n')
    
    const summary = processor.getStorageSummary()
    
    expect(summary).toContain('$ echo "Hello World"')
    expect(summary).toContain('Hello World')
    expect(summary).toContain('$ ls')
    expect(summary).toContain('file1.txt')
  })
  
  it('should restore from stored data', () => {
    const storedData = '$ echo "test"\ntest\n\n$ pwd\n/home/user'
    
    const processor = TerminalOutputProcessor.fromStoredData(storedData)
    const data = processor.getProcessedData()
    
    expect(data.commands).toHaveLength(2)
    expect(data.commands[0].command).toBe('echo "test"')
    expect(data.commands[0].output).toBe('test')
    expect(data.commands[1].command).toBe('pwd')
    expect(data.commands[1].output).toBe('/home/user')
  })
})