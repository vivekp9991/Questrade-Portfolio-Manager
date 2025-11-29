/**
 * Structured Logger for Lambda Functions
 * Uses JSON format for CloudWatch Logs integration
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL || 'INFO'];

class Logger {
  constructor(context = {}) {
    this.context = context;
  }

  _log(level, message, meta = {}) {
    if (LOG_LEVELS[level] < currentLogLevel) {
      return;
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...meta
    };

    // In Lambda, console.log writes to CloudWatch Logs
    console.log(JSON.stringify(logEntry));
  }

  debug(message, meta) {
    this._log('DEBUG', message, meta);
  }

  info(message, meta) {
    this._log('INFO', message, meta);
  }

  warn(message, meta) {
    this._log('WARN', message, meta);
  }

  error(message, meta) {
    this._log('ERROR', message, meta);
  }

  // Create a child logger with additional context
  child(context) {
    return new Logger({ ...this.context, ...context });
  }
}

// Export a default logger instance
module.exports = new Logger();

// Export the Logger class for creating custom instances
module.exports.Logger = Logger;
