/**
 * Service interfaces and type definitions
 * These interfaces define the contract for each service that can be used within actions
 */

// Logger Service
export interface LoggerService {
  info: (message: string, data?: any) => Promise<LogResult>;
  error: (message: string, error?: any) => Promise<LogResult>;
  debug: (message: string, data?: any) => Promise<LogResult>;
  warn: (message: string, data?: any) => Promise<LogResult>;
}

export interface LogResult {
  logged: boolean;
  message: string;
  level: 'info' | 'error' | 'debug' | 'warn';
  timestamp: number;
  data?: any;
  error?: any;
}

// Database Service
export interface DatabaseService {
  query: <T = any>(sql: string, params?: any[]) => Promise<QueryResult<T>>;
  insert: <T = any>(table: string, data: T) => Promise<InsertResult>;
  update: <T = any>(table: string, id: string, data: Partial<T>) => Promise<UpdateResult>;
  delete: (table: string, id: string) => Promise<DeleteResult>;
  transaction: <T>(operations: () => Promise<T>) => Promise<T>;
}

export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  fields?: string[];
}

export interface InsertResult {
  id: string;
  success: boolean;
  affectedRows: number;
}

export interface UpdateResult {
  affected: number;
  success: boolean;
  modifiedFields?: string[];
}

export interface DeleteResult {
  affected: number;
  success: boolean;
}

// Email Service
export interface EmailService {
  send: (to: string | string[], subject: string, body: string, options?: EmailOptions) => Promise<EmailResult>;
  sendTemplate: (to: string | string[], templateId: string, data: any, options?: EmailOptions) => Promise<EmailResult>;
  sendBulk: (recipients: EmailRecipient[], options?: EmailOptions) => Promise<BulkEmailResult>;
}

export interface EmailOptions {
  from?: string;
  cc?: string[];
  bcc?: string[];
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
  priority?: 'high' | 'normal' | 'low';
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface EmailRecipient {
  to: string;
  subject: string;
  body?: string;
  templateId?: string;
  templateData?: any;
}

export interface EmailResult {
  messageId: string;
  success: boolean;
  to: string | string[];
  subject: string;
  timestamp: number;
  status?: 'sent' | 'queued' | 'failed';
}

export interface BulkEmailResult {
  sent: number;
  failed: number;
  results: EmailResult[];
}

// HTTP Service
export interface HttpService {
  get: <T = any>(url: string, options?: HttpOptions) => Promise<HttpResponse<T>>;
  post: <T = any>(url: string, data?: any, options?: HttpOptions) => Promise<HttpResponse<T>>;
  put: <T = any>(url: string, data?: any, options?: HttpOptions) => Promise<HttpResponse<T>>;
  patch: <T = any>(url: string, data?: any, options?: HttpOptions) => Promise<HttpResponse<T>>;
  delete: <T = any>(url: string, options?: HttpOptions) => Promise<HttpResponse<T>>;
  head: (url: string, options?: HttpOptions) => Promise<HttpResponse<void>>;
}

export interface HttpOptions {
  headers?: Record<string, string>;
  timeout?: number;
  auth?: {
    username: string;
    password: string;
  };
  params?: Record<string, any>;
  responseType?: 'json' | 'text' | 'blob' | 'stream';
}

export interface HttpResponse<T = any> {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  data: T;
  config?: HttpOptions;
}

// Storage Service
export interface StorageService {
  save: <T = any>(key: string, data: T, options?: StorageOptions) => Promise<StorageResult>;
  load: <T = any>(key: string) => Promise<StorageLoadResult<T>>;
  delete: (key: string) => Promise<StorageDeleteResult>;
  list: (prefix?: string, options?: StorageListOptions) => Promise<StorageListResult>;
  exists: (key: string) => Promise<boolean>;
  getMetadata: (key: string) => Promise<StorageMetadata>;
}

export interface StorageOptions {
  ttl?: number; // Time to live in seconds
  metadata?: Record<string, any>;
  encryption?: boolean;
  compression?: boolean;
}

export interface StorageListOptions {
  limit?: number;
  offset?: number;
  includeMetadata?: boolean;
}

export interface StorageResult {
  key: string;
  size: number;
  success: boolean;
  etag?: string;
  metadata?: Record<string, any>;
}

export interface StorageLoadResult<T = any> {
  data: T;
  found: boolean;
  metadata?: StorageMetadata;
}

export interface StorageDeleteResult {
  deleted: boolean;
  key: string;
}

export interface StorageListResult {
  keys: string[];
  count: number;
  total: number;
  items?: StorageItem[];
}

export interface StorageItem {
  key: string;
  size: number;
  lastModified: number;
  metadata?: Record<string, any>;
}

export interface StorageMetadata {
  size: number;
  lastModified: number;
  contentType?: string;
  etag?: string;
  custom?: Record<string, any>;
}

// Service Registry
export interface Services {
  logger: LoggerService;
  database: DatabaseService;
  email: EmailService;
  http: HttpService;
  storage: StorageService;
}

// Service metadata for potential action generation
export interface ServiceMetadata {
  name: string;
  description: string;
  category: string;
  methods: ServiceMethodMetadata[];
}

export interface ServiceMethodMetadata {
  name: string;
  description: string;
  parameters: ServiceParameterMetadata[];
  returns: string;
  example?: string;
}

export interface ServiceParameterMetadata {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: any;
}