'use client';

import { useState, useEffect } from 'react';
import { CheckCircle, Clock, FileText, BookOpen, Layers, BarChart3, AlertCircle } from 'lucide-react';
import { Card, Progress, Badge, Spinner } from '@/components/ui';

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
  error?: string;
}

export interface ProcessingStatusProps {
  documentId: string;
  onComplete?: (data: ProcessingStatusData) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

interface DetailItemProps {
  label: string;
  value: string | number;
}

function DetailItem({ label, value }: DetailItemProps) {
  return (
    <div className="processing-status-detail">
      <span className="processing-status-detail-label">{label}</span>
      <span className="processing-status-detail-value">{value}</span>
    </div>
  );
}

interface StatusSectionProps {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}

function StatusSection({ icon: Icon, title, children }: StatusSectionProps) {
  return (
    <Card>
      <div className="processing-status-section">
        <div className="processing-status-section-header">
          <Icon className="processing-status-section-icon" />
          <h4>{title}</h4>
        </div>
        {children}
      </div>
    </Card>
  );
}

interface DocumentInfoProps {
  document: NonNullable<ProcessingStatusData['document']>;
}

function DocumentInfo({ document }: DocumentInfoProps) {
  return (
    <StatusSection icon={FileText} title="Document">
      <div className="processing-status-details">
        <DetailItem label="Filename" value={document.filename} />
        <DetailItem label="Type" value={document.fileType} />
        <DetailItem label="Size" value={formatFileSize(document.size)} />
        <DetailItem label="Uploaded" value={formatDate(document.uploadedAt)} />
      </div>
    </StatusSection>
  );
}

interface BookInfoProps {
  book: NonNullable<ProcessingStatusData['book']>;
}

function BookInfo({ book }: BookInfoProps) {
  return (
    <StatusSection icon={BookOpen} title="Parsed Book">
      <div className="processing-status-details">
        <DetailItem label="Title" value={book.title} />
        <DetailItem label="Language" value={book.language} />
        <DetailItem label="Chapters" value={book.totalChapters} />
        <DetailItem label="Verses" value={book.totalVerses} />
      </div>
      {book.description && (
        <p className="processing-status-description">{book.description}</p>
      )}
    </StatusSection>
  );
}

interface ChaptersListProps {
  chapters: ProcessingStatusData['chapters'];
}

function ChaptersList({ chapters }: ChaptersListProps) {
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

interface AnalysisProgressProps {
  analyses: ProcessingStatusData['analyses'];
}

function AnalysisProgress({ analyses }: AnalysisProgressProps) {
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

export default function ProcessingStatus({ documentId, onComplete }: ProcessingStatusProps) {
  const [data, setData] = useState<ProcessingStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(true);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/status/${documentId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch status');
        }
        const statusData: ProcessingStatusData = await response.json();
        setData(statusData);

        if (statusData.status === 'completed' || statusData.status === 'failed') {
          setPolling(false);
          if (statusData.status === 'completed' && onComplete) {
            onComplete(statusData);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch status');
        setPolling(false);
      }
    };

    fetchStatus();

    if (polling) {
      intervalId = setInterval(fetchStatus, 2000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [documentId, polling, onComplete]);

  if (error) {
    return (
      <Card>
        <div className="processing-status-error">
          <AlertCircle className="processing-status-error-icon" />
          <p>{error}</p>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <div className="processing-status-loading">
          <Spinner size="lg" />
          <p>Loading status...</p>
        </div>
      </Card>
    );
  }

  const statusConfig = {
    uploaded: { label: 'Uploaded', color: 'blue' as const, icon: Clock },
    processing: { label: 'Processing', color: 'yellow' as const, icon: Clock },
    completed: { label: 'Completed', color: 'green' as const, icon: CheckCircle },
    failed: { label: 'Failed', color: 'red' as const, icon: AlertCircle },
  };

  const currentStatus = statusConfig[data.status];
  const StatusIcon = currentStatus.icon;

  return (
    <div className="processing-status">
      {/* Header with status */}
      <Card>
        <div className="processing-status-header">
          <div className="processing-status-title">
            <StatusIcon className={`processing-status-icon processing-status-icon-${currentStatus.color}`} />
            <div>
              <h3>Processing Status</h3>
              <Badge variant={currentStatus.color}>{currentStatus.label}</Badge>
            </div>
          </div>
          {data.status === 'processing' && <Spinner size="md" />}
        </div>
      </Card>

      {data.document && <DocumentInfo document={data.document} />}
      {data.book && <BookInfo book={data.book} />}
      {data.chapters.length > 0 && <ChaptersList chapters={data.chapters} />}
      {data.book && <AnalysisProgress analyses={data.analyses} />}

      {/* Error message */}
      {data.error && (
        <Card>
          <div className="processing-status-error">
            <AlertCircle className="processing-status-error-icon" />
            <p>{data.error}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
