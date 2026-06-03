class ErrorHandler {
  constructor() {
    this.errorHandlers = new Map();
    this.defaultHandler = (err) => {
      console.error(JSON.stringify({ 
        type: 'error', 
        message: err.message, 
        stack: err.stack,
        timestamp: Date.now()
      }));
    };
  }

  register(type, handler) {
    this.errorHandlers.set(type, handler);
  }

  handle(err, context = {}) {
    const handler = this.errorHandlers.get(err.type) || this.defaultHandler;
    try {
      handler(err, context);
    } catch (e) {
      this.defaultHandler(err);
    }
  }

  wrap(fn) {
    return async function(...args) {
      try {
        return await fn(...args);
      } catch (err) {
        this.handle(err, { args });
        throw err;
      }
    }.bind(this);
  }
}

const errorHandler = new ErrorHandler();

errorHandler.register('validation-error', (err, context) => {
  console.error(JSON.stringify({
    type: 'validation-error',
    message: err.message,
    context: context,
    timestamp: Date.now()
  }));
});

errorHandler.register('network-error', (err, context) => {
  console.error(JSON.stringify({
    type: 'network-error',
    message: err.message,
    context: context,
    timestamp: Date.now()
  }));
});

errorHandler.register('file-error', (err, context) => {
  console.error(JSON.stringify({
    type: 'file-error',
    message: err.message,
    context: context,
    timestamp: Date.now()
  }));
});

module.exports = { ErrorHandler, errorHandler };