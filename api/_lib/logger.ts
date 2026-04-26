// api/_lib/logger.ts
// 構造化ロギングシステム

/**
 * ログレベル
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * ログメタデータ
 */
export interface LogMetadata {
    [key: string]: any;
}

/**
 * ログエントリ
 */
interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    metadata?: LogMetadata;
    error?: {
        message: string;
        stack?: string;
        name?: string;
    };
}

function normalizeError(error: unknown): LogEntry["error"] | undefined {
    if (!error) {
        return undefined;
    }

    if (error instanceof Error) {
        return {
            message: error.message,
            name: error.name,
            stack: error.stack,
        };
    }

    if (typeof error === "string") {
        return { message: error };
    }

    try {
        return { message: JSON.stringify(error) };
    } catch {
        return { message: String(error) };
    }
}

/**
 * ログを出力する内部関数
 */
function log(level: LogLevel, message: string, metadata?: LogMetadata, error?: unknown): void {
    const entry: LogEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
    };

    if (metadata && Object.keys(metadata).length > 0) {
        entry.metadata = metadata;
    }

    const normalizedError = normalizeError(error);
    if (normalizedError) {
        entry.error = normalizedError;
    }

    const output = JSON.stringify(entry);

    switch (level) {
        case "debug":
        case "info":
            console.log(output);
            break;
        case "warn":
            console.warn(output);
            break;
        case "error":
            console.error(output);
            break;
    }
}

/**
 * 構造化ロガー
 */
export const logger = {
    /**
     * デバッグレベルのログ
     * 開発時のデバッグ情報
     */
    debug(message: string, metadata?: LogMetadata): void {
        log("debug", message, metadata);
    },

    /**
     * 情報レベルのログ
     * 通常の動作情報
     */
    info(message: string, metadata?: LogMetadata): void {
        log("info", message, metadata);
    },

    /**
     * 警告レベルのログ
     * 問題の可能性があるが、処理は継続できる状況
     */
    warn(message: string, metadata?: LogMetadata): void {
        log("warn", message, metadata);
    },

    /**
     * エラーレベルのログ
     * エラーが発生し、処理が失敗した状況
     */
    error(message: string, error?: unknown, metadata?: LogMetadata): void {
        log("error", message, metadata, error);
    },
};

/**
 * 特定のコンテキスト用のロガーを作成
 * コンテキスト情報が全てのログに自動的に付与される
 */
export function createContextLogger(context: LogMetadata) {
    return {
        debug(message: string, metadata?: LogMetadata): void {
            logger.debug(message, { ...context, ...metadata });
        },
        info(message: string, metadata?: LogMetadata): void {
            logger.info(message, { ...context, ...metadata });
        },
        warn(message: string, metadata?: LogMetadata): void {
            logger.warn(message, { ...context, ...metadata });
        },
        error(message: string, error?: unknown, metadata?: LogMetadata): void {
            logger.error(message, error, { ...context, ...metadata });
        },
    };
}
