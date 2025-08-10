export const SERVER_CONFIG = {
  DEFAULT_PORT: 3001,
  get port(): number {
    return process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : this.DEFAULT_PORT;
  }
};

export const WS_CONFIG = {
  verifyClient: () => true // Accept all connections in dev/production
};