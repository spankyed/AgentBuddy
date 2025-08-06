export function registerInsertConsoleLogAction(editor: any, monaco: any) {
  editor.addAction({
    id: 'insert-console-log',
    label: 'Insert Console Log',
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL
    ],
    precondition: null,
    contextMenuGroupId: 'navigation',
    contextMenuOrder: 1.5,
    run: (ed: any) => {
      const selection = ed.getSelection()
      const model = ed.getModel()
      
      if (!selection || !model) return
      
      const selectedText = model.getValueInRange(selection)
      
      if (selectedText) {
        // Get the current position
        const position = ed.getPosition()
        
        // Create the console.log statement
        const consoleLogStatement = `console.log('${selectedText}', ${selectedText})`
        
        // If text is selected, insert at cursor position
        const insertPosition = selection.isEmpty() ? position : selection.getEndPosition()
        
        // Check if we need to add a new line
        const lineContent = model.getLineContent(insertPosition.lineNumber)
        const isEndOfLine = insertPosition.column > lineContent.length
        
        // Prepare the text to insert
        let textToInsert = consoleLogStatement
        if (!isEndOfLine) {
          // If not at end of line, insert on new line below
          textToInsert = '\n' + consoleLogStatement
        }
        
        // Execute the edit
        ed.executeEdits('insert-console-log', [{
          range: new monaco.Range(
            insertPosition.lineNumber,
            insertPosition.column,
            insertPosition.lineNumber,
            insertPosition.column
          ),
          text: textToInsert,
          forceMoveMarkers: true
        }])
        
        // Move cursor to end of inserted text
        const newPosition = isEndOfLine 
          ? { lineNumber: insertPosition.lineNumber, column: insertPosition.column + consoleLogStatement.length }
          : { lineNumber: insertPosition.lineNumber + 1, column: consoleLogStatement.length + 1 }
        ed.setPosition(newPosition)
      } else {
        // No text selected, insert empty console.log with cursor inside
        const position = ed.getPosition()
        const lineContent = model.getLineContent(position.lineNumber)
        const leadingWhitespace = lineContent.match(/^(\s*)/)?.[1] || ''
        
        // Insert console.log on new line with proper indentation
        ed.executeEdits('insert-console-log', [{
          range: new monaco.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column
          ),
          text: `\n${leadingWhitespace}console.log()`,
          forceMoveMarkers: true
        }])
        
        // Position cursor inside the parentheses
        ed.setPosition({
          lineNumber: position.lineNumber + 1,
          column: leadingWhitespace.length + 13 // "console.log(".length + indentation
        })
      }
    }
  })
}