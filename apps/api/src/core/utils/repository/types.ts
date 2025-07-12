/**
 * Common repository types for consistent return values and error handling
 */

// Success/failure result pattern for operations that return data
export type RepositoryResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string; code?: string };

// For operations that just need confirmation (update, delete)
export type OperationResult = RepositoryResult<void>;

// For batch operations
export type BatchResult<T> = {
  success: true;
  data: T[];
  failed?: never;
} | {
  success: false;
  error: string;
  data?: T[];
  failed?: Array<{ item: any; error: string }>;
};

// Common repository error codes
export const RepositoryErrorCode = {
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONSTRAINT_VIOLATION: 'CONSTRAINT_VIOLATION',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  CONCURRENCY_ERROR: 'CONCURRENCY_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type RepositoryErrorCode = typeof RepositoryErrorCode[keyof typeof RepositoryErrorCode];

// Base repository error class
export class RepositoryError extends Error {
  constructor(
    message: string,
    public code: RepositoryErrorCode = RepositoryErrorCode.UNKNOWN,
    public details?: any
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

// Helper to create consistent error results
export function errorResult(
  error: unknown,
  defaultMessage = 'An error occurred'
): { success: false; error: string; code?: string } {
  if (error instanceof RepositoryError) {
    return {
      success: false,
      error: error.message,
      code: error.code,
    };
  }
  
  if (error instanceof Error) {
    return {
      success: false,
      error: error.message,
    };
  }
  
  return {
    success: false,
    error: defaultMessage,
  };
}

// Helper to create success results
export function successResult<T>(data: T): RepositoryResult<T> {
  return { success: true, data };
}

// Helper for operation results
export function operationSuccess(): OperationResult {
  return { success: true, data: undefined };
} 