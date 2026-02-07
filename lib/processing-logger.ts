import {neon} from '@neondatabase/serverless';

export type LogLevel = 'info' | 'debug' | 'warn' | 'error';

export interface ProcessingLog {
    id: string;
    documentId: string;
    level: LogLevel;
    message: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
}

interface LogRow {
    id: string;
    document_id: string;
    level: string;
    message: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

let sql: ReturnType<typeof neon> | null = null;

function getSql() {
    if (!sql) {
        sql = neon(process.env.DATABASE_URL!);
    }
    return sql;
}

export class ProcessingLogger {
    private documentId: string;
    private buffer: Array<{level: LogLevel; message: string; metadata?: Record<string, unknown>}> = [];
    private flushTimeout: NodeJS.Timeout | null = null;

    constructor(documentId: string) {
        this.documentId = documentId;
    }

    private async writeLog(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
        try {
            await getSql()`
                INSERT INTO processing_logs (document_id, level, message, metadata)
                VALUES (${this.documentId}, ${level}, ${message}, ${metadata ? JSON.stringify(metadata) : null})
            `;
        } catch (error) {
            console.error('Failed to write processing log:', error);
        }
    }

    async info(message: string, metadata?: Record<string, unknown>) {
        console.log(`[${this.documentId}] INFO: ${message}`, metadata || '');
        await this.writeLog('info', message, metadata);
    }

    async debug(message: string, metadata?: Record<string, unknown>) {
        console.log(`[${this.documentId}] DEBUG: ${message}`, metadata || '');
        await this.writeLog('debug', message, metadata);
    }

    async warn(message: string, metadata?: Record<string, unknown>) {
        console.warn(`[${this.documentId}] WARN: ${message}`, metadata || '');
        await this.writeLog('warn', message, metadata);
    }

    async error(message: string, metadata?: Record<string, unknown>) {
        console.error(`[${this.documentId}] ERROR: ${message}`, metadata || '');
        await this.writeLog('error', message, metadata);
    }

    async llmRequest(model: string, promptLength: number, options?: Record<string, unknown>) {
        await this.info(`LLM Request → ${model}`, {
            model,
            promptLength,
            ...options,
        });
    }

    async llmResponse(model: string, responseLength: number, durationMs: number) {
        await this.info(`LLM Response ← ${model} (${durationMs}ms)`, {
            model,
            responseLength,
            durationMs,
        });
    }

    async chunkProcessing(chunkIndex: number, totalChunks: number, chunkSize: number) {
        await this.info(`Processing chunk ${chunkIndex + 1}/${totalChunks}`, {
            chunkIndex,
            totalChunks,
            chunkSize,
        });
    }

    async parseResult(chapters: number, verses: number) {
        await this.info(`Parsed: ${chapters} chapters, ${verses} verses`, {
            chapters,
            verses,
        });
    }

    async analysisStart(verseId: string, chapterNumber: number, verseNumber: number) {
        await this.info(`Analyzing verse ${chapterNumber}:${verseNumber}`, {
            verseId,
            chapterNumber,
            verseNumber,
        });
    }

    async analysisComplete(verseId: string, score: number, tags: string[]) {
        await this.info(`Analysis complete: score=${score}, tags=[${tags.join(', ')}]`, {
            verseId,
            score,
            tags,
        });
    }
}

export async function getLogsForDocument(documentId: string, limit = 100): Promise<ProcessingLog[]> {
    try {
        const rows = await getSql()`
            SELECT id, document_id, level, message, metadata, created_at
            FROM processing_logs
            WHERE document_id = ${documentId}
            ORDER BY created_at ASC
            LIMIT ${limit}
        ` as LogRow[];

        return rows.map(row => ({
            id: row.id,
            documentId: row.document_id,
            level: row.level as LogLevel,
            message: row.message,
            metadata: row.metadata || undefined,
            createdAt: new Date(row.created_at),
        }));
    } catch (error) {
        console.error('Failed to fetch processing logs:', error);
        return [];
    }
}

export function createLogger(documentId: string): ProcessingLogger {
    return new ProcessingLogger(documentId);
}
