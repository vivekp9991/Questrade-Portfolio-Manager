// src/utils/logger.js - Logging utility
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      let msg = `${timestamp} [${level}]: ${message}`;
      if (Object.keys(meta).length > 0) {
        try {
          // Safe stringify that handles circular references
          msg += ` ${JSON.stringify(meta, (key, value) => {
            // Skip circular references and large objects
            if (key === 'stack' && typeof value === 'string') return value.split('\n')[0];
            if (typeof value === 'object' && value !== null) {
              if (value.constructor && ['IncomingMessage', 'ClientRequest', 'Socket'].includes(value.constructor.name)) {
                return '[' + value.constructor.name + ']';
              }
            }
            return value;
          })}`;
        } catch (e) {
          msg += ` [Error serializing meta]`;
        }
      }
      return msg;
    })
  ),
  transports: [
    new winston.transports.Console()
  ]
});

module.exports = logger;
