class ExponentialBackoff {
  constructor({ 
    initialDelayMs = 1000, 
    maxDelayMs = 60000, 
    multiplier = 2, 
    jitter = 0.1 
  }) {
    this.initialDelayMs = initialDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.multiplier = multiplier;
    this.jitter = jitter;
    this.attempt = 0;
  }

  getNextDelay() {
    const baseDelay = Math.min(
      this.initialDelayMs * Math.pow(this.multiplier, this.attempt),
      this.maxDelayMs
    );
    
    const jitterAmount = baseDelay * this.jitter;
    const delayWithJitter = baseDelay + (Math.random() * jitterAmount * 2 - jitterAmount);
    
    this.attempt++;
    return Math.max(0, delayWithJitter);
  }

  reset() {
    this.attempt = 0;
  }

  getAttempt() {
    return this.attempt;
  }

  async wait() {
    const delay = this.getNextDelay();
    return new Promise(resolve => setTimeout(resolve, delay));
  }
}

class RetryPolicy {
  constructor({ backoff, maxAttempts = Infinity, onRetry }) {
    this.backoff = backoff;
    this.maxAttempts = maxAttempts;
    this.onRetry = onRetry;
    this.attempts = 0;
  }

  async execute(fn) {
    this.attempts = 0;
    this.backoff.reset();

    while (this.attempts < this.maxAttempts) {
      try {
        return await fn();
      } catch (err) {
        this.attempts++;
        
        if (this.attempts >= this.maxAttempts) {
          throw new Error(`Max retry attempts (${this.maxAttempts}) exceeded: ${err.message}`);
        }

        if (this.onRetry) {
          this.onRetry(this.attempts, err);
        }

        await this.backoff.wait();
      }
    }
  }
}

module.exports = { ExponentialBackoff, RetryPolicy };