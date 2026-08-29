export type LogLevel = "info" | "success" | "warn" | "error";

export type RunLogger = (level: LogLevel, message: string) => void;

/** Streams a JPEG screenshot buffer up to the UI so the run can be watched live. */
export type FrameEmitter = (jpegBuffer: Buffer) => void;
