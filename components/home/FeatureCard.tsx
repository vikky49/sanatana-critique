import { Card } from '@/components/ui';

export interface FeatureCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export default function FeatureCard({ title, description, children }: FeatureCardProps) {
  return (
    <Card>
      <h2 className="home-card-title">{title}</h2>
      <p className="home-card-description">{description}</p>
      {children}
    </Card>
  );
}
