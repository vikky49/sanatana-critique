import { File, X } from 'lucide-react';

export interface FilePreviewProps {
  file: File;
  onRemove?: () => void;
}

export default function FilePreview({ file, onRemove }: FilePreviewProps) {
  return (
    <div className="file-preview">
      <File className="file-preview-icon" />
      <div className="file-preview-info">
        <p className="file-preview-name">{file.name}</p>
        <p className="file-preview-size">{(file.size / 1024).toFixed(1)} KB</p>
      </div>
      {onRemove && (
        <button onClick={onRemove} className="file-preview-remove">
          <X className="file-preview-remove-icon" />
        </button>
      )}
    </div>
  );
}
