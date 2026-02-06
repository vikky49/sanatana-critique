'use client';

import { useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import FileDropzone from '../ui/FileDropzone';
import FilePreview from '../ui/FilePreview';
import Spinner from '../ui/Spinner';
import Alert from '../ui/Alert';
import { Button } from '../ui';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export interface UploadAreaProps {
  onUploadComplete: (documentId: string) => void;
}

export default function UploadArea({ onUploadComplete }: UploadAreaProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setState('idle');
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setState('uploading');
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Upload failed');
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
      <Spinner size="lg" />
      <p className="upload-area-status-text">
        Uploading {selectedFile?.name}...
      </p>
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
