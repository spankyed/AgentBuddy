import { linter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';

/**
 * Validates JSON using native parser
 */
function validateJSON(doc: string, view: EditorView): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  
  if (!doc.trim()) return diagnostics;
  
  try {
    JSON.parse(doc);
  } catch (error: any) {
    // Extract position from error message if available
    const match = error.message.match(/position (\d+)/);
    const pos = match ? parseInt(match[1], 10) : 0;
    
    // Try to find the actual error position
    let errorPos = pos;
    if (error.message.includes('Unexpected token')) {
      // Try to find the unexpected token
      const tokenMatch = error.message.match(/Unexpected token (.) in JSON/);
      if (tokenMatch) {
        const token = tokenMatch[1];
        const index = doc.indexOf(token, pos - 1);
        if (index !== -1) errorPos = index;
      }
    } else if (error.message.includes('Unexpected end')) {
      errorPos = doc.length - 1;
    }
    
    diagnostics.push({
      from: errorPos,
      to: errorPos + 1,
      severity: 'error',
      message: error.message.replace(/in JSON at position \d+/, '').trim()
    });
  }
  
  return diagnostics;
}

/**
 * Validates using Lezer syntax tree for all languages
 */
function validateWithLezer(doc: string, view: EditorView): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  
  if (!doc.trim()) return diagnostics;
  
  // Get the syntax tree from the current state
  const tree = syntaxTree(view.state);
  
  // Iterate through the tree looking for error nodes
  tree.iterate({
    enter: (node) => {
      if (node.type.isError) {
        const from = node.from;
        const to = node.to;
        
        // Get the problematic text for better error messages
        const text = view.state.doc.sliceString(from, Math.min(to, from + 20));
        
        let message = 'Syntax error';
        
        // Try to provide more specific messages based on context
        if (text.trim() === '') {
          message = 'Unexpected end of input';
        } else if (text.startsWith('}') || text.startsWith(')') || text.startsWith(']')) {
          message = `Unexpected token '${text[0]}'`;
        } else if (text.startsWith('{') || text.startsWith('(') || text.startsWith('[')) {
          const endChar = text[0] === '{' ? '}' : text[0] === '(' ? ')' : ']';
          message = `Missing closing '${endChar}'`;
        } else if (text) {
          // Try to extract a meaningful token
          const token = text.match(/^[^\s,;:{}()\[\]]+/)?.[0] || text.split(/\s/)[0];
          if (token) {
            message = `Unexpected token '${token}'`;
          }
        }
        
        diagnostics.push({
          from,
          to: to || from + 1,
          severity: 'error',
          message
        });
      }
    }
  });
  
  return diagnostics;
}

/**
 * Creates a multi-language syntax linter using Lezer parsers
 * @param language - Language identifier ('javascript', 'json', etc.) or 'auto' to detect from syntax tree
 */
export function createSyntaxLinter(language: string = 'auto') {
  return linter((view: EditorView) => {
    const doc = view.state.doc.toString();
    
    // Special handling for JSON since native parser gives better errors
    if (language === 'json') {
      return validateJSON(doc, view);
    }
    
    // Use Lezer for all other languages
    return validateWithLezer(doc, view);
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