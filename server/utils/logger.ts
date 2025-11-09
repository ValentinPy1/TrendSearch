/**
 * Unified logging utility with log levels
 */

export enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARN = 2,
    ERROR = 3,
}

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
    DEBUG: LogLevel.DEBUG,
    INFO: LogLevel.INFO,
    WARN: LogLevel.WARN,
    ERROR: LogLevel.ERROR,
};

// Get log level from environment
const getLogLevel = (): LogLevel => {
    const envLevel = (process.env.LOG_LEVEL || process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO').toUpperCase();
    return LOG_LEVEL_MAP[envLevel] ?? LogLevel.INFO;
};

const currentLogLevel = getLogLevel();

interface LogContext {
    stage?: string;
    seed?: string;
    keyword?: string;
    [key: string]: any;
}

class Logger {
    private shouldLog(level: LogLevel): boolean {
        return level >= currentLogLevel;
    }

    private formatMessage(level: string, message: string, context?: LogContext): string {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` ${JSON.stringify(context)}` : '';
        return `[${timestamp}] [${level}] ${message}${contextStr}`;
    }

    debug(message: string, context?: LogContext): void {
        if (this.shouldLog(LogLevel.DEBUG)) {
            console.log(this.formatMessage('DEBUG', message, context));
        }
    }

    info(message: string, context?: LogContext): void {
        if (this.shouldLog(LogLevel.INFO)) {
            console.log(this.formatMessage('INFO', message, context));
        }
    }

    warn(message: string, context?: LogContext): void {
        if (this.shouldLog(LogLevel.WARN)) {
            console.warn(this.formatMessage('WARN', message, context));
        }
    }

    error(message: string, error?: Error | unknown, context?: LogContext): void {
        if (this.shouldLog(LogLevel.ERROR)) {
            const errorContext = {
                ...context,
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack,
                } : String(error),
            };
            console.error(this.formatMessage('ERROR', message, errorContext));
        }
    }

    // Performance logging (always enabled)
    perf(stage: string, duration: number, details?: Record<string, number>): void {
        const detailsStr = details ? ` ${JSON.stringify(details)}` : '';
        console.log(`[PERF] ${stage}: ${duration}ms${detailsStr}`);
    }
}

export const logger = new Logger();

