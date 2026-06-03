const { Logger } = require('./logger');

const logger = new Logger('activity-tracker');

class ActivityTracker {
  constructor(idleTimeoutMs) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.lastActivity = Date.now();
    logger.debug('ActivityTracker initialized', { idleTimeoutMs });
  }

  touch() {
    this.lastActivity = Date.now();
    logger.debug('Activity detected');
  }

  getLastActivity() {
    return this.lastActivity;
  }

  isIdle() {
    const isIdle = Date.now() - this.lastActivity > this.idleTimeoutMs;
    if (isIdle) {
      logger.debug('Idle timeout reached', { idleTimeMs: this.getIdleTimeMs() });
    }
    return isIdle;
  }

  getIdleTimeMs() {
    return Date.now() - this.lastActivity;
  }
}

module.exports = { ActivityTracker };