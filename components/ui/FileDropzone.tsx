'use client';

import { useDropzone } from 'react-dropzone';
import { Upload } from 'lucide-react';

export interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  accept?: Record<string, string[]>;
  disabled?: boolean;
}

export default function FileDropzone({ onFileSelect, accept, disabled }: FileDropzoneProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onFileSelect(files[0]),
    accept,
    maxFiles: 1,
    disabled,
  });

  return (
    <div
      {...getRootProps()}
      className={`dropzone ${isDragActive ? 'dropzone-active' : ''} ${disabled ? 'dropzone-disabled' : ''}`}
    >
      <input {...getInputProps()} />
      <Upload className="dropzone-icon" />
      <div className="dropzone-content">
        <p className="dropzone-title">
          {isDragActive ? 'Drop your file here' : 'Upload a religious text'}
        </p>
        <p className="dropzone-subtitle">
          Drag and drop or click to select
        </p>
        <p className="dropzone-hint">
          Supports PDF, TXT, or JSON files
        </p>
      </div>
    </div>
  );
}
