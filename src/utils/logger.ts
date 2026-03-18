import pino from 'pino';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function createLogger(level: LogLevel = 'info') {
  return pino({ level });
}

/**
 * Default singleton logger.
 * Uses LOG_LEVEL env var so modules can import before config is loaded.
 * Re-create via createLogger(config.logging.level) in main() if you
 * need the full config-driven level at startup.
 */
export const logger = createLogger(
  (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info',
);
