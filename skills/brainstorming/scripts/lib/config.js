const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf'
};

const DEFAULT_CONFIG = {
  HOST: '127.0.0.1',
  PORT: 8080,
  URL_HOST: '127.0.0.1',
  CONTENT_DIR: path.join(__dirname, '../../content'),
  STATE_DIR: path.join(__dirname, '../../state'),
  ownerPid: parseInt(process.env.BRAINSTORM_OWNER_PID || '0', 10),
  IDLE_TIMEOUT_MS: 300000,
  LIFECYCLE_CHECK_INTERVAL_MS: 5000,
  DEBOUNCE_DELAY_MS: 100,
  MAX_EVENT_QUEUE_SIZE: 100,
  MAX_RECONNECT_DELAY: 30000,
  ACTIVITY_TIMEOUT: 300000,
  LOG_LEVEL: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
};

function loadConfig(env = process.env) {
  const config = { ...DEFAULT_CONFIG };
  
  if (env.BRAINSTORM_HOST) {
    config.HOST = env.BRAINSTORM_HOST;
    config.URL_HOST = env.BRAINSTORM_HOST;
  }
  if (env.BRAINSTORM_URL_HOST) {
    config.URL_HOST = env.BRAINSTORM_URL_HOST;
  }
  if (env.BRAINSTORM_PORT) {
    const port = parseInt(env.BRAINSTORM_PORT, 10);
    if (!isNaN(port) && port > 0 && port < 65536) {
      config.PORT = port;
    }
  }
  if (env.BRAINSTORM_CONTENT_DIR) {
    config.CONTENT_DIR = env.BRAINSTORM_CONTENT_DIR;
  }
  if (env.BRAINSTORM_STATE_DIR) {
    config.STATE_DIR = env.BRAINSTORM_STATE_DIR;
  }
  if (env.BRAINSTORM_OWNER_PID) {
    const pid = parseInt(env.BRAINSTORM_OWNER_PID, 10);
    if (!isNaN(pid) && pid > 0) {
      config.ownerPid = pid;
    }
  }
  if (env.BRAINSTORM_IDLE_TIMEOUT_MS) {
    const timeout = parseInt(env.BRAINSTORM_IDLE_TIMEOUT_MS, 10);
    if (!isNaN(timeout) && timeout > 0) {
      config.IDLE_TIMEOUT_MS = timeout;
    }
  }
  if (env.BRAINSTORM_LOG_LEVEL) {
    const levels = ['debug', 'info', 'warn', 'error'];
    if (levels.includes(env.BRAINSTORM_LOG_LEVEL.toLowerCase())) {
      config.LOG_LEVEL = env.BRAINSTORM_LOG_LEVEL.toLowerCase();
    }
  }
  
  return config;
}

module.exports = {
  ...DEFAULT_CONFIG,
  MIME_TYPES,
  DEFAULT_CONFIG,
  loadConfig
};