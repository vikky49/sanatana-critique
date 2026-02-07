'use client';

import {useState, useEffect, useRef, useCallback} from 'react';
import {CheckCircle, Clock, FileText, BookOpen, Layers, BarChart3, AlertCircle, Terminal} from 'lucide-react';
import {Card, Progress, Badge, Spinner} from '@/components/ui';

// =============================================================================
// Types
// =============================================================================

interface ProcessingStatusData {
    documentId: string;
    status: 'uploaded' | 'processing' | 'completed' | 'failed';
    document: {
        filename: string;
        fileType: string;
        size: number;
        uploadedAt: string;
    } | null;
    book: {
        id: string;
        title: string;
        description: string;
        language: string;
        totalChapters: number;
        totalVerses: number;
    } | null;
    chapters: Array<{
        number: number;
        title: string;
        verseCount: number;
    }>;
    analyses: {
        total: number;
        completed: number;
    };
    logs?: string[];
    error?: string;
}

export interface ProcessingStatusProps {
    documentId: string;
    onComplete?: (data: ProcessingStatusData) => void;
}

type StatusType = ProcessingStatusData['status'];

interface StatusConfig {
    label: string;
    color: 'blue' | 'yellow' | 'green' | 'red';
    icon: React.ElementType;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY_PREFIX = 'processing-logs-';
const POLLING_INTERVAL_MS = 2000;

const STATUS_CONFIG: Record<StatusType, StatusConfig> = {
    uploaded: {label: 'Uploaded', color: 'blue', icon: Clock},
    processing: {label: 'Processing', color: 'yellow', icon: Clock},
    completed: {label: 'Completed', color: 'green', icon: CheckCircle},
    failed: {label: 'Failed', color: 'red', icon: AlertCircle},
};

// =============================================================================
// Utility Functions
// =============================================================================

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleString();
}

function getStorageKey(documentId: string): string {
    return `${STORAGE_KEY_PREFIX}${documentId}`;
}

function loadLogsFromStorage(documentId: string): string[] {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(getStorageKey(documentId));
    return stored ? JSON.parse(stored) : [];
}

function saveLogsToStorage(documentId: string, logs: string[]): void {
    if (logs.length > 0) {
        localStorage.setItem(getStorageKey(documentId), JSON.stringify(logs));
    }
}

// =============================================================================
// Log Generation
// =============================================================================

function generateLogsFromStateChange(
    current: ProcessingStatusData,
    previous: ProcessingStatusData | null
): string[] {
    const logs: string[] = [];

    if (!previous && current.document) {
        logs.push(`Document uploaded: ${current.document.filename}`);
    }

    if (current.status === 'processing' && previous?.status !== 'processing') {
        logs.push('Starting document processing...');
    }

    if (current.book && !previous?.book) {
        logs.push(`Parsed book: "${current.book.title}"`);
        logs.push(`Found ${current.book.totalChapters} chapters, ${current.book.totalVerses} verses`);
    }

    if (current.chapters.length > (previous?.chapters.length ?? 0)) {
        const newChapters = current.chapters.slice(previous?.chapters.length ?? 0);
        newChapters.forEach(ch => {
            logs.push(`Processed Chapter ${ch.number}: ${ch.title} (${ch.verseCount} verses)`);
        });
    }

    const prevCompleted = previous?.analyses.completed ?? 0;
    if (current.analyses.completed > prevCompleted) {
        const diff = current.analyses.completed - prevCompleted;
        logs.push(`Analyzed ${diff} verse(s) (${current.analyses.completed}/${current.analyses.total} total)`);
    }

    if (current.status === 'completed' && previous?.status !== 'completed') {
        logs.push('Processing complete!');
    }

    if (current.status === 'failed' && previous?.status !== 'failed') {
        logs.push(`Error: ${current.error || 'Processing failed'}`);
    }

    if (current.logs) {
        logs.push(...current.logs);
    }

    return logs;
}

// =============================================================================
// Custom Hook: useProcessingStatus
// =============================================================================

interface UseProcessingStatusResult {
    data: ProcessingStatusData | null;
    logs: string[];
    error: string | null;
    isPolling: boolean;
}

function useProcessingStatus(
    documentId: string,
    onComplete?: (data: ProcessingStatusData) => void
): UseProcessingStatusResult {
    const [data, setData] = useState<ProcessingStatusData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPolling, setIsPolling] = useState(true);
    const [logs, setLogs] = useState<string[]>(() => loadLogsFromStorage(documentId));

    const prevDataRef = useRef<ProcessingStatusData | null>(null);
    const isRestoredSession = useRef(
        typeof window !== 'undefined' && localStorage.getItem(getStorageKey(documentId)) !== null
    );

    // Persist logs to localStorage
    useEffect(() => {
        saveLogsToStorage(documentId, logs);
    }, [logs, documentId]);

    const handleStatusUpdate = useCallback((statusData: ProcessingStatusData) => {
        setData(statusData);

        const prevData = prevDataRef.current;

        // Skip log generation on first fetch if we restored from localStorage
        if (!prevData && isRestoredSession.current) {
            isRestoredSession.current = false;
            prevDataRef.current = statusData;
            return;
        }

        const newLogs = generateLogsFromStateChange(statusData, prevData);
        if (newLogs.length > 0) {
            setLogs(prev => [...prev, ...newLogs]);
        }

        prevDataRef.current = statusData;

        if (statusData.status === 'completed' || statusData.status === 'failed') {
            setIsPolling(false);
            if (statusData.status === 'completed') {
                onComplete?.(statusData);
            }
        }
    }, [onComplete]);

    const fetchStatus = useCallback(async () => {
        try {
            const response = await fetch(`/api/status/${documentId}`);
            if (!response.ok) {
                throw new Error('Failed to fetch status');
            }
            const statusData: ProcessingStatusData = await response.json();
            handleStatusUpdate(statusData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch status');
            setIsPolling(false);
        }
    }, [documentId, handleStatusUpdate]);

    useEffect(() => {
        fetchStatus();

        if (!isPolling) return;

        const intervalId = setInterval(fetchStatus, POLLING_INTERVAL_MS);
        return () => clearInterval(intervalId);
    }, [fetchStatus, isPolling]);

    return {data, logs, error, isPolling};
}

// =============================================================================
// UI Components
// =============================================================================

function DetailItem({label, value}: {label: string; value: string | number}) {
    return (
        <div className="processing-status-detail">
            <span className="processing-status-detail-label">{label}</span>
            <span className="processing-status-detail-value">{value}</span>
        </div>
    );
}

function StatusSection({icon: Icon, title, children}: {
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <Card>
            <div className="processing-status-section">
                <div className="processing-status-section-header">
                    <Icon className="processing-status-section-icon"/>
                    <h4>{title}</h4>
                </div>
                {children}
            </div>
        </Card>
    );
}

function DocumentInfo({document}: {document: NonNullable<ProcessingStatusData['document']>}) {
    return (
        <StatusSection icon={FileText} title="Document">
            <div className="processing-status-details">
                <DetailItem label="Filename" value={document.filename}/>
                <DetailItem label="Type" value={document.fileType}/>
                <DetailItem label="Size" value={formatFileSize(document.size)}/>
                <DetailItem label="Uploaded" value={formatDate(document.uploadedAt)}/>
            </div>
        </StatusSection>
    );
}

function BookInfo({book}: {book: NonNullable<ProcessingStatusData['book']>}) {
    return (
        <StatusSection icon={BookOpen} title="Parsed Book">
            <div className="processing-status-details">
                <DetailItem label="Title" value={book.title}/>
                <DetailItem label="Language" value={book.language}/>
                <DetailItem label="Chapters" value={book.totalChapters}/>
                <DetailItem label="Verses" value={book.totalVerses}/>
            </div>
            {book.description && (
                <p className="processing-status-description">{book.description}</p>
            )}
        </StatusSection>
    );
}

function ChaptersList({chapters}: {chapters: ProcessingStatusData['chapters']}) {
    return (
        <StatusSection icon={Layers} title={`Chapters (${chapters.length})`}>
            <div className="processing-status-chapters">
                {chapters.map((chapter) => (
                    <div key={chapter.number} className="processing-status-chapter">
                        <span className="processing-status-chapter-number">Ch. {chapter.number}</span>
                        <span className="processing-status-chapter-title">{chapter.title}</span>
                        <Badge variant="gray">{chapter.verseCount} verses</Badge>
                    </div>
                ))}
            </div>
        </StatusSection>
    );
}

function AnalysisProgress({analyses}: {analyses: ProcessingStatusData['analyses']}) {
    const percentage = analyses.total > 0 ? (analyses.completed / analyses.total) * 100 : 0;
    return (
        <StatusSection icon={BarChart3} title="Analysis Progress">
            <Progress
                value={percentage}
                label={`${analyses.completed} of ${analyses.total} verses analyzed`}
            />
        </StatusSection>
    );
}

function ProcessingTerminal({logs, isProcessing}: {logs: string[]; isProcessing: boolean}) {
    const terminalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [logs]);

    return (
        <StatusSection icon={Terminal} title="Processing Log">
            <div ref={terminalRef} className="processing-terminal">
                {logs.map((log, index) => (
                    <div key={index} className="processing-terminal-line">
                        <span className="processing-terminal-prefix">$</span>
                        <span className="processing-terminal-text">{log}</span>
                    </div>
                ))}
                {isProcessing && (
                    <div className="processing-terminal-line processing-terminal-cursor">
                        <span className="processing-terminal-prefix">$</span>
                        <span className="processing-terminal-blink">_</span>
                    </div>
                )}
            </div>
        </StatusSection>
    );
}

function StatusHeader({data}: {data: ProcessingStatusData}) {
    const config = STATUS_CONFIG[data.status];
    const StatusIcon = config.icon;

    return (
        <Card>
            <div className="processing-status-header">
                <div className="processing-status-title">
                    <StatusIcon className={`processing-status-icon processing-status-icon-${config.color}`}/>
                    <div>
                        <h3>Processing Status</h3>
                        <Badge variant={config.color}>{config.label}</Badge>
                    </div>
                </div>
                {data.status === 'processing' && <Spinner size="md"/>}
            </div>
        </Card>
    );
}

function ErrorDisplay({message}: {message: string}) {
    return (
        <Card>
            <div className="processing-status-error">
                <AlertCircle className="processing-status-error-icon"/>
                <p>{message}</p>
            </div>
        </Card>
    );
}

function LoadingDisplay() {
    return (
        <Card>
            <div className="processing-status-loading">
                <Spinner size="lg"/>
                <p>Loading status...</p>
            </div>
        </Card>
    );
}

// =============================================================================
// Main Component
// =============================================================================

export default function ProcessingStatus({documentId, onComplete}: ProcessingStatusProps) {
    const {data, logs, error} = useProcessingStatus(documentId, onComplete);

    if (error) return <ErrorDisplay message={error}/>;
    if (!data) return <LoadingDisplay/>;

    return (
        <div className="processing-status">
            <StatusHeader data={data}/>
            {data.document && <DocumentInfo document={data.document}/>}
            {data.book && <BookInfo book={data.book}/>}
            {data.chapters.length > 0 && <ChaptersList chapters={data.chapters}/>}
            {data.book && <AnalysisProgress analyses={data.analyses}/>}
            {logs.length > 0 && <ProcessingTerminal logs={logs} isProcessing={data.status === 'processing'}/>}
            {data.error && <ErrorDisplay message={data.error}/>}
        </div>
    );
}
