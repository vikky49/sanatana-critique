type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogContext {
    [key: string]: unknown;
}

function formatLog(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const logData = {
        timestamp,
        level: level.toUpperCase(),
        message,
        ...context,
    };
    return JSON.stringify(logData);
}

export const logger = {
    info: (message: string, context?: LogContext) => {
        console.log(formatLog('info', message, context));
    },

    warn: (message: string, context?: LogContext) => {
        console.warn(formatLog('warn', message, context));
    },

    error: (message: string, context?: LogContext) => {
        console.error(formatLog('error', message, context));
    },

    debug: (message: string, context?: LogContext) => {
        console.debug(formatLog('debug', message, context));
    },
};
