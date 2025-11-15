/**
 * Logging utility
 */
class Logger {
  constructor(level = 'info') {
    this.level = level;
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };
  }

  _shouldLog(level) {
    return this.levels[level] >= this.levels[this.level];
  }

  _formatMessage(level, message, data) {
    const timestamp = new Date().toISOString();
    const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${dataStr}`;
  }

  debug(message, data) {
    if (this._shouldLog('debug')) {
      console.log(this._formatMessage('debug', message, data));
    }
  }

  info(message, data) {
    if (this._shouldLog('info')) {
      console.log(this._formatMessage('info', message, data));
    }
  }

  warn(message, data) {
    if (this._shouldLog('warn')) {
      console.warn(this._formatMessage('warn', message, data));
    }
  }

  error(message, data) {
    if (this._shouldLog('error')) {
      console.error(this._formatMessage('error', message, data));
    }
  }
}

module.exports = new Logger(process.env.LOG_LEVEL || 'info');
