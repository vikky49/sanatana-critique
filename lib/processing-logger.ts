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
    private enableDb: boolean;

    constructor(documentId: string) {
        this.documentId = documentId;
        this.enableDb = process.env.LOG_TO_DB !== 'false';
    }

    // Fire-and-forget DB logging (never blocks main flow)
    private writeLog(level: LogLevel, message: string, metadata?: Record<string, unknown>) {
        try {
            if (!this.enableDb) return;
            const p = getSql()`
                INSERT INTO processing_logs (document_id, level, message, metadata)
                VALUES (${this.documentId}, ${level}, ${message}, ${metadata ? JSON.stringify(metadata) : null})
            ` as Promise<unknown>;
            p.catch((error) => {
                console.error('Failed to write processing log:', error);
            });
        } catch (error) {
            console.error('Failed to enqueue processing log:', error);
        }
    }

    info(message: string, metadata?: Record<string, unknown>) {
        console.log(`[${this.documentId}] INFO: ${message}`, metadata || '');
        this.writeLog('info', message, metadata);
    }

    debug(message: string, metadata?: Record<string, unknown>) {
        console.log(`[${this.documentId}] DEBUG: ${message}`, metadata || '');
        this.writeLog('debug', message, metadata);
    }

    warn(message: string, metadata?: Record<string, unknown>) {
        console.warn(`[${this.documentId}] WARN: ${message}`, metadata || '');
        this.writeLog('warn', message, metadata);
    }

    error(message: string, metadata?: Record<string, unknown>) {
        console.error(`[${this.documentId}] ERROR: ${message}`, metadata || '');
        this.writeLog('error', message, metadata);
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
        // First check if table exists
        const tableCheck = await getSql()`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'processing_logs'
            ) as exists
        ` as Array<{ exists: boolean }>;
        
        if (!tableCheck[0]?.exists) {
            console.warn('processing_logs table does not exist');
            return [{
                id: 'system-warning',
                documentId,
                level: 'warn',
                message: 'Processing logs table not found. Run db:init to create it.',
                createdAt: new Date(),
            }];
        }

        const rows = await getSql()`
            SELECT id, document_id, level, message, metadata, created_at
            FROM processing_logs
            WHERE document_id = ${documentId}
            ORDER BY created_at ASC
            LIMIT ${limit}
        ` as LogRow[];

        console.log(`Fetched ${rows.length} logs for document ${documentId}`);

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
        return [{
            id: 'system-error',
            documentId,
            level: 'error',
            message: `Failed to fetch logs: ${error instanceof Error ? error.message : 'Unknown error'}`,
            createdAt: new Date(),
        }];
    }
}

export function createLogger(documentId: string): ProcessingLogger {
    return new ProcessingLogger(documentId);
}
