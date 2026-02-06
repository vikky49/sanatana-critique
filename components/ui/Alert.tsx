export interface AlertProps {
  children: React.ReactNode;
  variant?: 'success' | 'error' | 'warning' | 'info';
}

export default function Alert({ children, variant = 'info' }: AlertProps) {
  return (
    <div className={`alert alert-${variant}`}>
      {children}
    </div>
  );
}
