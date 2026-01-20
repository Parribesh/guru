import { BrowserWindow } from 'electron';
export declare enum LogLevel {
    INFO = "info",
    SUCCESS = "success",
    WARNING = "warning",
    ERROR = "error",
    DEBUG = "debug"
}
export interface LogEvent {
    id: string;
    timestamp: number;
    level: LogLevel;
    category: string;
    message: string;
    details?: any;
    progress?: {
        current: number;
        total: number;
        percentage?: number;
    };
}
declare class EventLogger {
    private mainWindow;
    private eventIdCounter;
    private maxEvents;
    private events;
    private logFilePath;
    private logFileStream;
    constructor();
    setMainWindow(window: BrowserWindow): void;
    private writeToLogFile;
    private generateId;
    private emit;
    private getConsoleMethod;
    log(level: LogLevel, category: string, message: string, details?: any, progress?: {
        current: number;
        total: number;
    }): void;
    shutdown(): void;
    info(category: string, message: string, details?: any): void;
    success(category: string, message: string, details?: any): void;
    warning(category: string, message: string, details?: any): void;
    error(category: string, message: string, details?: any): void;
    debug(category: string, message: string, details?: any): void;
    progress(category: string, message: string, current: number, total: number, details?: any): void;
    getEvents(): LogEvent[];
    clear(): void;
}
export declare const eventLogger: EventLogger;
export {};
//# sourceMappingURL=event-logger.d.ts.map