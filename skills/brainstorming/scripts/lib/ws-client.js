const { Logger } = require('./logger');

class WebSocketClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = {
      maxReconnectDelay: 30000,
      baseReconnectDelay: 1000,
      jitterFactor: 1000,
      maxQueueSize: 100,
      ...options
    };
    this.ws = null;
    this.eventQueue = [];
    this.reconnectAttempts = 0;
    this.logger = new Logger('ws-client');
    this.connected = false;
    this.onMessageCallback = null;
    this.onConnectCallback = null;
    this.onDisconnectCallback = null;
  }

  getReconnectDelay() {
    const delay = Math.min(
      this.options.maxReconnectDelay,
      this.options.baseReconnectDelay * Math.pow(2, this.reconnectAttempts)
    );
    const jitter = Math.random() * this.options.jitterFactor;
    return delay + jitter;
  }

  connect() {
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // Ignore close errors
      }
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.logger.info('Connected to WebSocket server');
      
      this.eventQueue.forEach(event => {
        try {
          this.ws.send(JSON.stringify(event));
        } catch (e) {
          this.logger.error('Failed to send queued event', { error: e.message });
        }
      });
      this.eventQueue = [];

      if (this.onConnectCallback) {
        this.onConnectCallback();
      }
    };

    this.ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (this.onMessageCallback) {
          this.onMessageCallback(data);
        }
      } catch (e) {
        this.logger.error('Failed to parse WebSocket message', { error: e.message });
      }
    };

    this.ws.onerror = (error) => {
      this.logger.error('WebSocket error', { error: error.message });
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.reconnectAttempts++;
      const delay = this.getReconnectDelay();
      
      this.logger.warn('WebSocket closed, reconnecting', {
        attempts: this.reconnectAttempts,
        delay: Math.round(delay / 1000) + 's'
      });

      if (this.onDisconnectCallback) {
        this.onDisconnectCallback();
      }

      setTimeout(() => this.connect(), delay);
    };
  }

  send(event) {
    event.timestamp = Date.now();
    
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(event));
      } catch (e) {
        this.logger.error('Failed to send event', { error: e.message, eventType: event.type });
        this._queueEvent(event);
      }
    } else {
      this._queueEvent(event);
    }
  }

  _queueEvent(event) {
    if (this.eventQueue.length >= this.options.maxQueueSize) {
      this.eventQueue.shift();
    }
    this.eventQueue.push(event);
  }

  onMessage(callback) {
    this.onMessageCallback = callback;
  }

  onConnect(callback) {
    this.onConnectCallback = callback;
  }

  onDisconnect(callback) {
    this.onDisconnectCallback = callback;
  }

  close(code = 1000, reason = '') {
    if (this.ws) {
      try {
        this.ws.close(code, reason);
      } catch (e) {
        // Ignore
      }
    }
  }

  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

module.exports = { WebSocketClient };