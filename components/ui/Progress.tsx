export interface ProgressProps {
  value: number;
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function Progress({ value, label, showPercentage = true, size = 'md' }: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className="progress-container">
      {(label || showPercentage) && (
        <div className="progress-header">
          {label && <span className="progress-label">{label}</span>}
          {showPercentage && <span className="progress-percentage">{Math.round(clampedValue)}%</span>}
        </div>
      )}
      <div className={`progress progress-${size}`}>
        <div className="progress-bar" style={{ width: `${clampedValue}%` }} />
      </div>
    </div>
  );
}
