/**
 * Monaco Editor Custom Actions
 * Defines custom editor actions that can be registered with Monaco editors
 */

import type { editor } from 'monaco-editor'

type Monaco = typeof import('monaco-editor')

/**
 * Create insert console log action
 */
export function createInsertConsoleLogAction(monaco: Monaco): editor.IActionDescriptor {
  return {
    id: 'insert-console-log',
    label: 'Insert Console Log',
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL
    ],
    precondition: undefined,
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.5,
    run: (ed: editor.ICodeEditor) => {
      const selection = ed.getSelection()
      const model = ed.getModel()
      
      if (!selection || !model) return
      
      const selectedText = model.getValueInRange(selection)
      const lineNumber = selection.getEndPosition().lineNumber
      const lineContent = model.getLineContent(lineNumber)
      const leadingWhitespace = lineContent.match(/^(\s*)/)?.[1] || ''
      const isLastLine = lineNumber === model.getLineCount()
      
      // Build console.log statement
      const logStatement = selectedText 
        ? `console.log('${selectedText}', ${selectedText})`
        : 'console.log()'
      
      // Determine insertion point and text
      const insertText = isLastLine
        ? `\n${leadingWhitespace}${logStatement}`
        : `${leadingWhitespace}${logStatement}\n`
      
      const insertRange = isLastLine
        ? new monaco.Range(lineNumber, lineContent.length + 1, lineNumber, lineContent.length + 1)
        : new monaco.Range(lineNumber + 1, 1, lineNumber + 1, 1)
      
      // Execute the edit
      ed.executeEdits('insert-console-log', [{
        range: insertRange,
        text: insertText,
        forceMoveMarkers: true
      }])
      
      // Position cursor
      const cursorColumn = leadingWhitespace.length + (selectedText ? logStatement.length + 1 : 13)
      ed.setPosition({
        lineNumber: lineNumber + 1,
        column: cursorColumn
      })
    }
  }
}