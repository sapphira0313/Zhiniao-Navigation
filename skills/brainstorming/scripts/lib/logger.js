class Logger {
  constructor(prefix = '') {
    this.prefix = prefix;
  }

  _formatMessage(type, message, context = {}) {
    const timestamp = new Date().toISOString();
    const base = {
      timestamp,
      type,
      message,
      ...context
    };
    if (this.prefix) {
      base.prefix = this.prefix;
    }
    return JSON.stringify(base);
  }

  info(message, context = {}) {
    console.log(this._formatMessage('info', message, context));
  }

  warn(message, context = {}) {
    console.warn(this._formatMessage('warn', message, context));
  }

  error(message, context = {}) {
    console.error(this._formatMessage('error', message, context));
  }

  debug(message, context = {}) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(this._formatMessage('debug', message, context));
    }
  }
}

module.exports = { Logger };