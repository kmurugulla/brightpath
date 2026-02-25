/**
 * Logging utility with configurable log levels
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
};

/**
 * Logger configuration
 * Set LOG_LEVEL to control verbosity in production
 */
const config = {
  // Change to LOG_LEVELS.INFO or LOG_LEVELS.WARN for production
  level: LOG_LEVELS.DEBUG,
  prefix: '[MediaIndexer]',
};

/**
 * Set log level
 * @param {number} level - Log level from LOG_LEVELS
 */
export function setLogLevel(level) {
  config.level = level;
}

/**
 * Debug logging - verbose details for development
 * @param {string} message - Log message
 * @param  {...any} args - Additional arguments
 */
export function debug(message, ...args) {
  if (config.level <= LOG_LEVELS.DEBUG) {
    // eslint-disable-next-line no-console
    console.log(`${config.prefix}[DEBUG]`, message, ...args);
  }
}

/**
 * Info logging - general information
 * @param {string} message - Log message
 * @param  {...any} args - Additional arguments
 */
export function info(message, ...args) {
  if (config.level <= LOG_LEVELS.INFO) {
    // eslint-disable-next-line no-console
    console.log(`${config.prefix}[INFO]`, message, ...args);
  }
}

/**
 * Warning logging - potential issues
 * @param {string} message - Log message
 * @param  {...any} args - Additional arguments
 */
export function warn(message, ...args) {
  if (config.level <= LOG_LEVELS.WARN) {
    // eslint-disable-next-line no-console
    console.warn(`${config.prefix}[WARN]`, message, ...args);
  }
}

/**
 * Error logging - failures and exceptions
 * @param {string} message - Log message
 * @param  {...any} args - Additional arguments
 */
export function error(message, ...args) {
  if (config.level <= LOG_LEVELS.ERROR) {
    // eslint-disable-next-line no-console
    console.error(`${config.prefix}[ERROR]`, message, ...args);
  }
}

export { LOG_LEVELS };
