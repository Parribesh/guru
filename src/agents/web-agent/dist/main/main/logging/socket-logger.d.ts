export declare enum SocketLogLevel {
    INFO = "info",
    SUCCESS = "success",
    WARNING = "warning",
    ERROR = "error",
    DEBUG = "debug"
}
export interface SocketLogEvent {
    timestamp: number;
    level: SocketLogLevel;
    action: string;
    message: string;
    details?: any;
}
declare class SocketLogger {
    private logFilePath;
    private logFileStream;
    private logsDir;
    constructor();
    private writeToLogFile;
    private log;
    info(action: string, message: string, details?: any): void;
    success(action: string, message: string, details?: any): void;
    warning(action: string, message: string, details?: any): void;
    error(action: string, message: string, details?: any): void;
    debug(action: string, message: string, details?: any): void;
    close(): void;
}
export declare const socketLogger: SocketLogger;
export {};
//# sourceMappingURL=socket-logger.d.ts.map