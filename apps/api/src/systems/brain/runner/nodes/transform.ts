/**
 * Simple transform functions
 */
function applyTransform(value: any, transform: string): any {
  switch (transform) {
    case 'toString':
      return String(value);
    case 'toNumber':
      return Number(value);
    case 'toBoolean':
      return Boolean(value);
    case 'toJSON':
      return JSON.stringify(value);
    case 'fromJSON':
      return typeof value === 'string' ? JSON.parse(value) : value;
    case 'toUpperCase':
      return String(value).toUpperCase();
    case 'toLowerCase':
      return String(value).toLowerCase();
    default:
      // logger.warn(`Unknown transform: ${transform}`);
      return value;
  }
} 