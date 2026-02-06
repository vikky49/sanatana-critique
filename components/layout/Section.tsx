export interface SectionProps {
  children: React.ReactNode;
}

export default function Section({ children }: SectionProps) {
  return <div className="section">{children}</div>;
}
