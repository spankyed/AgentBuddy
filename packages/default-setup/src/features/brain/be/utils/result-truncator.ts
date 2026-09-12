/**
 * Result truncation utility to prevent unbounded memory growth
 * Truncates large results while preserving essential data and adding metadata
 */

// Configuration constants
export const MAX_STRING_LENGTH = 10240;  // 10KB for string values
export const MAX_OBJECT_SIZE = 51200;    // 50KB for serialized objects
export const MAX_ARRAY_ITEMS = 100;      // Maximum array items to preserve
export const MAX_DEPTH = 10;             // Maximum object nesting depth

interface TruncatedResult {
  value: any;
  _truncated: boolean;
  _originalSize?: number;
  _originalLength?: number;
  _type: string;
}

/**
 * Truncates a result value to prevent memory overflow
 * Adds metadata about truncation for transparency
 */
export function truncateResult(result: any, depth: number = 0): any {
  // Prevent infinite recursion
  if (depth > MAX_DEPTH) {
    return {
      value: '[Max depth exceeded]',
      _truncated: true,
      _type: typeof result
    };
  }

  // Handle null/undefined
  if (result === null || result === undefined) {
    return result;
  }

  // Handle strings
  if (typeof result === 'string') {
    if (result.length <= MAX_STRING_LENGTH) {
      return result;
    }

    // Truncate at word boundary if possible
    let truncateAt = MAX_STRING_LENGTH;
    const lastSpace = result.lastIndexOf(' ', MAX_STRING_LENGTH);
    if (lastSpace > MAX_STRING_LENGTH * 0.8) {
      truncateAt = lastSpace;
    }

    return {
      value: result.substring(0, truncateAt) + '...',
      _truncated: true,
      _originalLength: result.length,
      _type: 'string'
    };
  }

  // Handle arrays
  if (Array.isArray(result)) {
    if (result.length <= MAX_ARRAY_ITEMS) {
      // Recursively truncate array items
      return result.map(item => truncateResult(item, depth + 1));
    }

    return {
      value: result.slice(0, MAX_ARRAY_ITEMS).map(item => truncateResult(item, depth + 1)),
      _truncated: true,
      _originalLength: result.length,
      _type: 'array'
    };
  }

  // Handle objects
  if (typeof result === 'object') {
    try {
      // Check serialized size
      const serialized = JSON.stringify(result);
      if (serialized.length <= MAX_OBJECT_SIZE) {
        // Recursively truncate object values
        const truncatedObj: Record<string, any> = {};
        for (const [key, value] of Object.entries(result)) {
          truncatedObj[key] = truncateResult(value, depth + 1);
        }
        return truncatedObj;
      }

      // Object too large - truncate by keeping first N keys
      const keys = Object.keys(result);
      const keepKeys = Math.min(keys.length, 20); // Keep first 20 keys
      const truncatedObj: Record<string, any> = {};
      
      for (let i = 0; i < keepKeys; i++) {
        const key = keys[i];
        truncatedObj[key] = truncateResult(result[key], depth + 1);
      }

      return {
        value: truncatedObj,
        _truncated: true,
        _originalSize: serialized.length,
        _originalKeys: keys.length,
        _type: 'object'
      };
    } catch (error) {
      // Handle circular references or other serialization errors
      return {
        value: '[Object with circular reference]',
        _truncated: true,
        _error: 'serialization_failed',
        _type: 'object'
      };
    }
  }

  // Handle primitives (numbers, booleans, etc.)
  return result;
}

/**
 * Checks if a result has been truncated
 */
export function isTruncated(result: any): boolean {
  return result && typeof result === 'object' && result._truncated === true;
}

/**
 * Gets the display value from a potentially truncated result
 */
export function getDisplayValue(result: any): any {
  if (isTruncated(result)) {
    return result.value;
  }
  return result;
}