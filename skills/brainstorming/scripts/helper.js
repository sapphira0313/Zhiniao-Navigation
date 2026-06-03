(function() {
  const WS_URL = 'ws://' + window.location.host;
  const MAX_QUEUE_SIZE = 100;
  
  let ws = null;
  let eventQueue = [];
  let reconnectAttempts = 0;
  const MAX_RECONNECT_DELAY = 30000;
  const BASE_RECONNECT_DELAY = 1000;

  function log(level, message, context = {}) {
    const logMessage = `[Brainstorm] ${message}`;
    if (context && Object.keys(context).length > 0) {
      console[level](logMessage, context);
    } else {
      console[level](logMessage);
    }
  }

  function getReconnectDelay() {
    const delay = Math.min(MAX_RECONNECT_DELAY, BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts));
    const jitter = Math.random() * 1000;
    return delay + jitter;
  }

  function connect() {
    if (ws) {
      try { ws.close(1000, 'Reconnecting'); } catch (e) {}
    }
    
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      reconnectAttempts = 0;
      log('log', 'Connected to WebSocket');
      
      eventQueue.forEach((event, index) => {
        try {
          ws.send(JSON.stringify(event));
        } catch (e) {
          log('warn', `Failed to send queued event ${index}:`, { error: e.message });
        }
      });
      eventQueue = [];
      log('debug', `Flushed ${eventQueue.length} queued events`);
    };

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'reload') {
          log('debug', 'Received reload command');
          window.location.reload();
        } else {
          log('debug', 'Received message:', { type: data.type });
        }
      } catch (e) {
        log('error', 'Failed to parse message:', { error: e.message });
      }
    };

    ws.onerror = (error) => {
      log('error', 'WebSocket error:', { error: error.message || error });
    };

    ws.onclose = (event) => {
      reconnectAttempts++;
      const delay = getReconnectDelay();
      const code = event.code;
      const reason = event.reason || 'unknown';
      
      if (code !== 1000 && code !== 1001) {
        log('warn', `Disconnected unexpectedly (code: ${code}, reason: ${reason})`);
      }
      
      log('info', `Reconnecting in ${Math.round(delay/1000)}s (attempt ${reconnectAttempts})`);
      setTimeout(connect, delay);
    };
  }

  function validateEvent(event) {
    if (!event || typeof event !== 'object') {
      log('warn', 'Invalid event: must be an object');
      return false;
    }
    if (!event.type || typeof event.type !== 'string') {
      log('warn', 'Invalid event: type is required');
      return false;
    }
    return true;
  }

  function sendEvent(event) {
    if (!validateEvent(event)) {
      return;
    }
    
    event.timestamp = Date.now();
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(event));
        log('debug', 'Event sent:', { type: event.type });
      } catch (e) {
        log('warn', 'Failed to send event, queueing:', { error: e.message });
        queueEvent(event);
      }
    } else {
      log('debug', 'WebSocket not open, queueing event:', { type: event.type });
      queueEvent(event);
    }
  }

  function queueEvent(event) {
    if (eventQueue.length >= MAX_QUEUE_SIZE) {
      const dropped = eventQueue.shift();
      log('warn', 'Event queue full, dropping oldest event:', { type: dropped.type });
    }
    eventQueue.push(event);
  }

  function updateIndicator(target) {
    setTimeout(() => {
      const indicator = document.getElementById('indicator-text');
      if (!indicator) return;
      
      const container = target.closest('.options') || target.closest('.cards');
      const selected = container ? container.querySelectorAll('.selected') : [];
      
      if (selected.length === 0) {
        indicator.textContent = 'Click an option above, then return to the terminal';
      } else if (selected.length === 1) {
        const label = selected[0].querySelector('h3, .content h3, .card-body h3')?.textContent?.trim() || selected[0].dataset.choice;
        indicator.innerHTML = '<span class="selected-text">' + label + ' selected</span> — return to terminal to continue';
      } else {
        indicator.innerHTML = '<span class="selected-text">' + selected.length + ' selected</span> — return to terminal to continue';
      }
    }, 0);
  }

  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-choice]');
    if (!target) return;

    sendEvent({
      type: 'click',
      text: target.textContent.trim(),
      choice: target.dataset.choice,
      id: target.id || null
    });

    updateIndicator(target);
  });

  window.selectedChoice = null;

  window.toggleSelect = function(el) {
    const container = el.closest('.options') || el.closest('.cards');
    const multi = container && container.dataset.multiselect !== undefined;
    
    if (container && !multi) {
      container.querySelectorAll('.option, .card').forEach(o => o.classList.remove('selected'));
    }
    
    if (multi) {
      el.classList.toggle('selected');
    } else {
      el.classList.add('selected');
    }
    
    window.selectedChoice = el.dataset.choice;
  };

  window.brainstorm = {
    send: sendEvent,
    choice: (value, metadata = {}) => sendEvent({ type: 'choice', value, ...metadata }),
    connect: connect,
    isConnected: () => ws && ws.readyState === WebSocket.OPEN,
    getQueueSize: () => eventQueue.length
  };

  connect();
})();