'use client';

import { useState } from 'react';
import { upload } from '@vercel/blob/client';
import { CheckCircle, XCircle, Upload as UploadIcon } from 'lucide-react';
import FileDropzone from '../ui/FileDropzone';
import FilePreview from '../ui/FilePreview';
import Alert from '../ui/Alert';
import { Button } from '../ui';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export interface UploadAreaProps {
  onUploadComplete: (documentId: string) => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function UploadArea({ onUploadComplete }: UploadAreaProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setState('idle');
    setError(null);
    setUploadProgress(0);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setState('uploading');
    setError(null);
    setUploadProgress(0);

    try {
      // Step 1: Upload directly to Vercel Blob (bypasses serverless function size limit)
      const blob = await upload(
        `documents/${Date.now()}-${selectedFile.name}`,
        selectedFile,
        {
          access: 'public',
          handleUploadUrl: '/api/blob/upload',
          onUploadProgress: (progress) => {
            setUploadProgress(Math.round(progress.percentage));
          },
        }
      );

      // Step 2: Create document record in database
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blobUrl: blob.url,
          filename: selectedFile.name,
          fileType: selectedFile.type,
          size: selectedFile.size,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create document');
      }

      const data = await response.json();
      setState('success');
      setTimeout(() => onUploadComplete(data.documentId), 1000);
    } catch (err) {
      setState('error');
      setError(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  const handleReset = () => {
    setState('idle');
    setSelectedFile(null);
    setError(null);
    setUploadProgress(0);
  };

  const renderDropzone = () => (
    <FileDropzone
      onFileSelect={handleFileSelect}
      accept={{
        'text/plain': ['.txt'],
        'application/pdf': ['.pdf'],
        'application/json': ['.json'],
      }}
    />
  );

  const renderFileSelected = () => (
    <div className="upload-area-content">
      <FilePreview file={selectedFile!} onRemove={handleReset} />
      <div className="upload-area-actions">
        <Button variant="primary" size="md" onClick={handleUpload}>
          Upload and Process
        </Button>
        <Button variant="outline" size="md" onClick={handleReset}>
          Cancel
        </Button>
      </div>
    </div>
  );

  const renderUploading = () => (
    <div className="upload-area-status">
      <div className="upload-progress-container">
        <UploadIcon className="upload-area-status-icon animate-pulse" />
        <p className="upload-area-status-text">
          Uploading {selectedFile?.name}
        </p>
        <p className="upload-area-status-subtext">
          {formatFileSize(selectedFile?.size ?? 0)} • {uploadProgress}%
        </p>
        <div className="upload-progress-bar">
          <div 
            className="upload-progress-fill" 
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      </div>
    </div>
  );

  const renderSuccess = () => (
    <div className="upload-area-status">
      <CheckCircle className="upload-area-status-icon upload-area-status-success" />
      <p className="upload-area-status-text">Upload successful!</p>
    </div>
  );

  const renderError = () => (
    <div className="upload-area-content">
      <Alert variant="error">
        <div className="upload-area-error">
          <XCircle className="upload-area-error-icon" />
          <div>
            <p className="upload-area-error-title">Upload failed</p>
            <p className="upload-area-error-message">{error}</p>
          </div>
        </div>
      </Alert>
      <Button variant="primary" size="md" onClick={handleReset}>
        Try Again
      </Button>
    </div>
  );

  const renderContent = () => {
    if (state === 'uploading') return renderUploading();
    if (state === 'success') return renderSuccess();
    if (state === 'error') return renderError();
    if (selectedFile) return renderFileSelected();
    return renderDropzone();
  };

  return <div className="upload-area">{renderContent()}</div>;
}
