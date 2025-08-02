// Language mapping utility for Monaco Editor

const LANGUAGE_MAP: Record<string, string> = {
  // TypeScript/JavaScript
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  // Vue - using HTML for basic highlighting
  vue: 'html',
  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  // Data
  json: 'json',
  jsonc: 'json',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  // Programming
  py: 'python',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  php: 'php',
  rb: 'ruby',
  swift: 'swift',
  kt: 'kotlin',
  // Shell
  sh: 'shell',
  bash: 'shell',
  ps1: 'powershell',
  // Markup
  md: 'markdown',
  // SQL
  sql: 'sql',
}

export function getLanguageId(filePath: string): string {
  // Check if this is an action file
  if (filePath.startsWith('action:')) {
    return 'typescript'
  }
  
  // Check if this is a prompt file
  if (filePath.startsWith('prompt:')) {
    return 'typescript'
  }
  
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return LANGUAGE_MAP[ext] || 'plaintext'
}