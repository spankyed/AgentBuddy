const isDev = import.meta.env.DEV;

export const WINDOW_CONFIG = {
  // Main window dimensions
  WIDTH: isDev ? 1400 : 1920,
  HEIGHT: isDev ? 900 : 1200,
  MIN_WIDTH: 900,
  MIN_HEIGHT: 600,
  
  // Window identification
  MAIN_TITLE: 'AgentBuddy-Main',
  POPOUT_TITLE_PREFIX: 'AgentBuddy-Popout',
  
  // Timing
  SPLASH_CLOSE_DELAY: 200, // ms
  
} as const;
