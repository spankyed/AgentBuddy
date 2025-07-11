export interface Tab {
  id: string;
  label: string;
  artifacts: ArtifactItem[];
  selectedArtifactId?: string;
}

export type ArtifactType = 'text' | 'code' | 'review' | 'image' | 'workload' | 'slack';

export interface ArtifactItem {
  id: string;
  type: ArtifactType;
  title: string;
  content: any;
  metadata?: {
    createdAt: number;
    updatedAt?: number;
    [key: string]: any;
  };
}