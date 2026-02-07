'use client';

import { useState } from 'react';
import { CheckCircle, XCircle, Upload } from 'lucide-react';
import FileDropzone from '../ui/FileDropzone';
import FilePreview from '../ui/FilePreview';
import Spinner from '../ui/Spinner';
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
      const formData = new FormData();
      formData.append('file', selectedFile);

      // Use XMLHttpRequest for upload progress tracking
      const xhr = new XMLHttpRequest();
      
      const uploadPromise = new Promise<{ documentId: string }>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(progress);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              const errorData = JSON.parse(xhr.responseText);
              reject(new Error(errorData.message || 'Upload failed'));
            } catch {
              reject(new Error('Upload failed'));
            }
          }
        });

        xhr.addEventListener('error', () => reject(new Error('Network error')));
        xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);

      const data = await uploadPromise;
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
        <Upload className="upload-area-status-icon animate-pulse" />
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
