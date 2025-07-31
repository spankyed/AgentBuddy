// Data models shared between main, preload, and renderer

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: 'en' | 'es' | 'fr' | 'de';
  notifications: boolean;
}

export interface AppConfig {
  version: string;
  environment: 'development' | 'production';
  apiUrl?: string;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: Date;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  dueDate?: Date;
  tags: string[];
}