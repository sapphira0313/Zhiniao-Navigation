const { Logger } = require('./logger');

const logger = new Logger('validation');

const ALLOWED_EVENT_TYPES = ['click', 'choice', 'submit', 'reload'];

function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return { valid: false, error: 'event must be an object' };
  }

  if (event.type !== undefined) {
    if (typeof event.type !== 'string') {
      return { valid: false, error: 'type must be a string' };
    }
    if (event.type && !ALLOWED_EVENT_TYPES.includes(event.type)) {
      logger.warn('Unknown event type', { type: event.type });
    }
  }

  if (event.choice !== undefined) {
    if (typeof event.choice !== 'string' && typeof event.choice !== 'number') {
      return { valid: false, error: 'choice must be a string or number' };
    }
  }

  if (event.value !== undefined) {
    if (typeof event.value !== 'string' && typeof event.value !== 'number') {
      return { valid: false, error: 'value must be a string or number' };
    }
  }

  if (event.timestamp !== undefined && typeof event.timestamp !== 'number') {
    return { valid: false, error: 'timestamp must be a number' };
  }

  return { valid: true };
}

function parseJsonMessage(text) {
  try {
    const event = JSON.parse(text);
    const validation = validateEvent(event);
    if (!validation.valid) {
      logger.warn('Event validation failed', { error: validation.error });
      return { success: false, error: validation.error };
    }
    return { success: true, event };
  } catch (e) {
    logger.warn('JSON parse error', { error: e.message });
    return { success: false, error: 'Failed to parse JSON: ' + e.message };
  }
}

module.exports = {
  validateEvent,
  parseJsonMessage,
  ALLOWED_EVENT_TYPES
};