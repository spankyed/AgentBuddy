export function isJsonString(value: any): boolean {
  if (typeof value !== 'string') return false;
  
  // Check if string starts with { or [ which indicates JSON
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false;
  }
  
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function isJsonObject(value: any): boolean {
  return value !== null && 
         typeof value === 'object' && 
         !Array.isArray(value) &&
         !(value instanceof Date);
}

export function isJsonArray(value: any): boolean {
  return Array.isArray(value);
}

export function isJsonLike(value: any): boolean {
  return isJsonString(value) || isJsonObject(value) || isJsonArray(value);
}

export function formatJsonValue(value: any): string {
  if (isJsonString(value)) {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  }
  
  if (isJsonObject(value) || isJsonArray(value)) {
    return JSON.stringify(value, null, 2);
  }
  
  return String(value);
}

export function getJsonPreview(value: any, maxLength: number = 50): string {
  const formatted = formatJsonValue(value);
  if (formatted.length <= maxLength) {
    return formatted;
  }
  
  // For single line, just truncate
  if (!formatted.includes('\n')) {
    return formatted.substring(0, maxLength) + '...';
  }
  
  // For multi-line JSON, try to show first few properties
  const lines = formatted.split('\n');
  let preview = '';
  let currentLength = 0;
  
  for (const line of lines) {
    if (currentLength + line.length > maxLength && preview) {
      preview += '\n  ...';
      break;
    }
    preview += (preview ? '\n' : '') + line;
    currentLength += line.length;
  }
  
  return preview;
}