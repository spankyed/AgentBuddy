import { linter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import * as acorn from 'acorn';
import * as acornLoose from 'acorn-loose';

/**
 * Creates a JavaScript/TypeScript syntax-only linter using Acorn parser
 * Only reports syntax errors, not semantic/type errors
 */
export function createSyntaxLinter() {
  return linter((view: EditorView) => {
    const diagnostics: Diagnostic[] = [];
    const doc = view.state.doc.toString();
    
    // Skip empty documents
    if (!doc.trim()) {
      return diagnostics;
    }
    
    try {
      // Try strict parsing first for accurate syntax checking
      acorn.parse(doc, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        allowReturnOutsideFunction: true,
        allowImportExportEverywhere: true,
        allowAwaitOutsideFunction: true,
        allowSuperOutsideMethod: true,
        allowHashBang: true
      });
    } catch (error: any) {
      // Parse error occurred - extract location and message
      if (error instanceof SyntaxError && (error as any).loc) {
        // Acorn provides line/column in error.loc
        const loc = (error as any).loc;
        const line = loc.line;
        const column = loc.column;
        
        // Convert line/column to absolute position
        const lineInfo = view.state.doc.line(line);
        const from = lineInfo.from + column;
        
        // Create a diagnostic for the syntax error
        diagnostics.push({
          from,
          to: from + 1, // Highlight at least one character
          severity: 'error',
          message: error.message.replace(/\s*\(\d+:\d+\)$/, '') // Remove position suffix from message
        });
      } else if ((error as any).pos !== undefined) {
        // Fallback for errors with pos property
        const pos = (error as any).pos;
        diagnostics.push({
          from: pos,
          to: pos + 1,
          severity: 'error',
          message: error.message || 'Syntax error'
        });
      } else {
        // Try loose parsing to get better error recovery
        try {
          acornLoose.parse(doc, {
            ecmaVersion: 'latest',
            sourceType: 'module'
          });
          // If loose parsing succeeds, report a generic syntax error
          diagnostics.push({
            from: 0,
            to: 1,
            severity: 'error',
            message: 'Syntax error in file'
          });
        } catch (looseError: any) {
          // Even loose parsing failed - report at position 0
          diagnostics.push({
            from: 0,
            to: 1,
            severity: 'error',
            message: error.message || 'Invalid JavaScript syntax'
          });
        }
      }
    }
    
    return diagnostics;
  });
}

/**
 * Theme adjustments for syntax error highlighting
 */
export const syntaxLinterTheme = EditorView.theme({
  '.cm-diagnostic': {
    padding: '2px 6px 2px 6px',
    marginLeft: '-1px',
    display: 'block',
    whiteSpace: 'pre-wrap'
  },
  '.cm-diagnostic-error': {
    borderLeft: '3px solid #ef4444',
    paddingLeft: '8px',
    marginLeft: '-11px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)'
  },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    textDecoration: 'underline wavy #ef4444'
  },
  '.cm-tooltip.cm-tooltip-hover': {
    border: '1px solid #404040',
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4'
  },
  '.cm-tooltip.cm-lint-tooltip': {
    border: '1px solid #404040',
    backgroundColor: '#1e1e1e',
    color: '#d4d4d4'
  }
});