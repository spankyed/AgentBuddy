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
  })
}