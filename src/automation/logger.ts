export type LogLevel = "info" | "success" | "warn" | "error";

export type RunLogger = (level: LogLevel, message: string) => void;
