export interface TabState {
  id: number;
  url: string;
  title: string;
  favicon: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  isMuted: boolean;
}

export interface TabBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
