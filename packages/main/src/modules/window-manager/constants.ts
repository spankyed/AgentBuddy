const isDev = import.meta.env.DEV;

export const WINDOW_CONFIG = {
  // Main window dimensions
  WIDTH: isDev ? 1400 : 1920,
  HEIGHT: isDev ? 900 : 1200,
  DEMO_WIDTH: 1440,
  DEMO_HEIGHT: 900,
  MIN_WIDTH: 900,
  MIN_HEIGHT: 600,
  
  // Window identification
  MAIN_TITLE: 'AgentBuddy-Main',
  
  // Timing
  SPLASH_CLOSE_DELAY: 200, // ms
  
} as const;
