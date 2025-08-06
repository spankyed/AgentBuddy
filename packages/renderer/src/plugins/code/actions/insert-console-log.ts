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
        // Create the console.log statement
        const consoleLogStatement = `console.log('${selectedText}', ${selectedText})`
        
        // Get the line where selection ends
        const insertLineNumber = selection.getEndPosition().lineNumber
        const currentLineContent = model.getLineContent(insertLineNumber)
        const leadingWhitespace = currentLineContent.match(/^(\s*)/)?.[1] || ''
        const totalLines = model.getLineCount()
        
        // Check if we're on the last line
        if (insertLineNumber === totalLines) {
          // Insert at end of current line with newline before
          const lineLength = currentLineContent.length
          ed.executeEdits('insert-console-log', [{
            range: new monaco.Range(
              insertLineNumber,
              lineLength + 1,
              insertLineNumber,
              lineLength + 1
            ),
            text: `\n${leadingWhitespace}${consoleLogStatement}`,
            forceMoveMarkers: true
          }])
          
          // Move cursor to end of inserted console.log
          ed.setPosition({
            lineNumber: insertLineNumber + 1,
            column: leadingWhitespace.length + consoleLogStatement.length + 1
          })
        } else {
          // Insert on new line below the current line
          ed.executeEdits('insert-console-log', [{
            range: new monaco.Range(
              insertLineNumber + 1,
              1,
              insertLineNumber + 1,
              1
            ),
            text: `${leadingWhitespace}${consoleLogStatement}\n`,
            forceMoveMarkers: true
          }])
          
          // Move cursor to end of inserted console.log
          ed.setPosition({
            lineNumber: insertLineNumber + 1,
            column: leadingWhitespace.length + consoleLogStatement.length + 1
          })
        }
      } else {
        // No text selected, insert empty console.log on new line below
        const position = ed.getPosition()
        const lineContent = model.getLineContent(position.lineNumber)
        const leadingWhitespace = lineContent.match(/^(\s*)/)?.[1] || ''
        const totalLines = model.getLineCount()
        
        // Check if we're on the last line
        if (position.lineNumber === totalLines) {
          // Insert at end of current line with newline before
          const lineLength = lineContent.length
          ed.executeEdits('insert-console-log', [{
            range: new monaco.Range(
              position.lineNumber,
              lineLength + 1,
              position.lineNumber,
              lineLength + 1
            ),
            text: `\n${leadingWhitespace}console.log()`,
            forceMoveMarkers: true
          }])
          
          // Position cursor inside the parentheses
          ed.setPosition({
            lineNumber: position.lineNumber + 1,
            column: leadingWhitespace.length + 13 // "console.log(".length + indentation
          })
        } else {
          // Insert on new line below current line
          ed.executeEdits('insert-console-log', [{
            range: new monaco.Range(
              position.lineNumber + 1,
              1,
              position.lineNumber + 1,
              1
            ),
            text: `${leadingWhitespace}console.log()\n`,
            forceMoveMarkers: true
          }])
          
          // Position cursor inside the parentheses
          ed.setPosition({
            lineNumber: position.lineNumber + 1,
            column: leadingWhitespace.length + 13 // "console.log(".length + indentation
          })
        }
      }
    }
  })
}