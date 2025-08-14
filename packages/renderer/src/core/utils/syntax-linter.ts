import { linter } from '@codemirror/lint';
import type { Diagnostic } from '@codemirror/lint';
import { EditorView } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import * as acorn from 'acorn';
import * as acornLoose from 'acorn-loose';
import * as yaml from 'js-yaml';

/**
 * Detects the language from file path or content
 */
function detectLanguage(filePath?: string, content?: string): string {
  if (!filePath) return 'javascript';
  
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  
  // Map file extensions to language types
  const languageMap: Record<string, string> = {
    // JavaScript/TypeScript
    js: 'javascript',
    jsx: 'javascript',
    ts: 'javascript',
    tsx: 'javascript',
    mjs: 'javascript',
    cjs: 'javascript',
    // JSON
    json: 'json',
    jsonc: 'json',
    // YAML
    yaml: 'yaml',
    yml: 'yaml',
    // Python
    py: 'python',
    // CSS
    css: 'css',
    scss: 'css',
    sass: 'css',
    less: 'css',
    // HTML
    html: 'html',
    htm: 'html',
    xml: 'xml',
    vue: 'html',
    // SQL
    sql: 'sql',
    // Markdown
    md: 'markdown',
    // Other
    sh: 'shell',
    bash: 'shell',
    ps1: 'powershell',
  };
  
  return languageMap[ext] || 'javascript';
}

/**
 * Validates JavaScript/TypeScript using Acorn
 */
function validateJavaScript(doc: string, view: EditorView): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  
  if (!doc.trim()) return diagnostics;
  
  try {
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
    if (error instanceof SyntaxError && (error as any).loc) {
      const loc = (error as any).loc;
      const line = loc.line;
      const column = loc.column;
      
      const lineInfo = view.state.doc.line(line);
      const from = lineInfo.from + column;
      
      diagnostics.push({
        from,
        to: from + 1,
        severity: 'error',
        message: error.message.replace(/\s*\(\d+:\d+\)$/, '')
      });
    } else if ((error as any).pos !== undefined) {
      const pos = (error as any).pos;
      diagnostics.push({
        from: pos,
        to: pos + 1,
        severity: 'error',
        message: error.message || 'Syntax error'
      });
    } else {
      // Try loose parsing
      try {
        acornLoose.parse(doc, {
          ecmaVersion: 'latest',
          sourceType: 'module'
        });
        diagnostics.push({
          from: 0,
          to: 1,
          severity: 'error',
          message: 'Syntax error in file'
        });
      } catch {
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
}

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
 * Validates YAML using js-yaml
 */
function validateYAML(doc: string, view: EditorView): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  
  if (!doc.trim()) return diagnostics;
  
  try {
    yaml.load(doc);
  } catch (error: any) {
    // js-yaml provides mark property with line/column
    if (error.mark) {
      const line = error.mark.line + 1; // js-yaml uses 0-based lines
      const column = error.mark.column;
      
      const lineInfo = view.state.doc.line(Math.min(line, view.state.doc.lines));
      const from = lineInfo.from + column;
      
      diagnostics.push({
        from,
        to: from + 1,
        severity: 'error',
        message: error.reason || error.message
      });
    } else {
      diagnostics.push({
        from: 0,
        to: 1,
        severity: 'error',
        message: error.message || 'Invalid YAML syntax'
      });
    }
  }
  
  return diagnostics;
}

/**
 * Validates using Lezer syntax tree (for languages with built-in parsers)
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
          message = `Unexpected token '${text.split(/\s/)[0]}'`;
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
 * Creates a multi-language syntax linter
 * @param languageOrPath - Either a language identifier ('javascript', 'json', 'yaml', etc.) or a file path
 */
export function createSyntaxLinter(languageOrPath?: string) {
  return linter((view: EditorView) => {
    const doc = view.state.doc.toString();
    
    // Check if it's a known language identifier or a file path
    const knownLanguages = ['javascript', 'json', 'yaml', 'python', 'css', 'html', 'xml', 'sql', 'markdown'];
    const language = knownLanguages.includes(languageOrPath || '') 
      ? languageOrPath 
      : detectLanguage(languageOrPath, doc);
    
    switch (language) {
      case 'javascript':
        return validateJavaScript(doc, view);
      case 'json':
        return validateJSON(doc, view);
      case 'yaml':
        return validateYAML(doc, view);
      case 'python':
      case 'css':
      case 'html':
      case 'xml':
      case 'sql':
      case 'markdown':
        // Use Lezer-based validation for these languages
        return validateWithLezer(doc, view);
      default:
        // For unknown languages, try JavaScript as fallback
        return validateJavaScript(doc, view);
    }
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