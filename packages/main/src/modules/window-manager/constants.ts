const isDev = import.meta.env.DEV;

export const WINDOW_CONFIG = {
  // Main window dimensions
  WIDTH: isDev ? 1400 : 1920,
  HEIGHT: isDev ? 900 : 1200,
  MIN_WIDTH: 900,
  MIN_HEIGHT: 600,
  
  // Window identification
  MAIN_TITLE: 'AgentBuddy-Main',
  
  // Timing
  SPLASH_CLOSE_DELAY: 200, // ms
  
  // Error display duration
  ERROR_DISPLAY_TIME: 5000, // ms

  // Chat popout window dimensions
  CHAT_WIDTH: 600,
  CHAT_HEIGHT: 800,
  CHAT_MIN_WIDTH: 400,
  CHAT_MIN_HEIGHT: 500,
  CHAT_TITLE_PREFIX: 'AgentBuddy-Chat-',
} as const;