const { Logger } = require('./logger');

const logger = new Logger('lifecycle-manager');

class LifecycleManager {
  constructor({ activityTracker, ownerPid, checkIntervalMs, onShutdown }) {
    this.activityTracker = activityTracker;
    this.ownerPid = ownerPid;
    this.checkIntervalMs = checkIntervalMs;
    this.onShutdown = onShutdown;
    this.lifecycleCheck = null;
    this.shuttingDown = false;
    logger.debug('LifecycleManager initialized', { ownerPid, checkIntervalMs });
  }

  start() {
    this.validateOwnerPidAtStartup();
    
    this.lifecycleCheck = setInterval(() => {
      this.check();
    }, this.checkIntervalMs);
    this.lifecycleCheck.unref();
    logger.debug('Lifecycle check started');
  }

  validateOwnerPidAtStartup() {
    if (!this.ownerPid) return;
    
    try {
      process.kill(this.ownerPid, 0);
    } catch (e) {
      if (e.code !== 'EPERM') {
        logger.warn('Owner PID invalid at startup', { pid: this.ownerPid });
        this.ownerPid = null;
      }
    }
  }

  ownerAlive() {
    if (!this.ownerPid) return true;
    try { 
      process.kill(this.ownerPid, 0); 
      return true; 
    } catch (e) { 
      return e.code === 'EPERM'; 
    }
  }

  check() {
    if (this.shuttingDown) return;
    
    if (!this.ownerAlive()) {
      logger.info('Owner process exited, initiating shutdown');
      this.shutdown('owner process exited');
    } else if (this.activityTracker.isIdle()) {
      logger.info('Idle timeout reached, initiating shutdown');
      this.shutdown('idle timeout');
    }
  }

  shutdown(reason) {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    
    logger.debug('Shutdown initiated', { reason });
    
    if (this.lifecycleCheck) {
      clearInterval(this.lifecycleCheck);
    }
    
    if (this.onShutdown) {
      this.onShutdown(reason);
    }
  }

  stop() {
    if (this.lifecycleCheck) {
      clearInterval(this.lifecycleCheck);
    }
    this.shuttingDown = true;
    logger.debug('Lifecycle check stopped');
  }
}

module.exports = { LifecycleManager };