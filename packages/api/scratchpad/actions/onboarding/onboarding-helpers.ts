export const DEFAULT_NAME = 'Kathy';

export const TECH_LEVELS = [
  { id: 'beginner', label: 'Beginner', description: 'New to programming' },
  { id: 'comfortable', label: 'Comfortable reading code', description: 'Can read and understand code' },
  { id: 'intermediate', label: 'Intermediate', description: 'Write code regularly' },
  { id: 'advanced', label: 'Advanced', description: 'Professional developer' },
];

export interface OnboardingState {
  step: 'name' | 'tech-level' | 'projects' | 'finish' | 'complete';
  threadId: string;
  pendingMessageId: string;
  data: { name?: string; techLevel?: string; projects?: string[] };
}
