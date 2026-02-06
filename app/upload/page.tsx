'use client';

import { useRouter } from 'next/navigation';
import { Container, PageHeader, Section } from '@/components/layout';
import { Card } from '@/components/ui';
import UploadArea from '@/components/upload/UploadArea';

export default function UploadPage() {
  const router = useRouter();

  const handleUploadComplete = (documentId: string) => {
    console.log('Document uploaded:', documentId);
    // TODO: Navigate to processing page when ready
    // router.push(`/process/${documentId}`);
  };

  return (
    <Container>
      <PageHeader
        title="Upload Religious Text"
        description="Upload a PDF, TXT, or JSON file containing a religious text for analysis"
      />
      
      <Section>
        <Card>
          <UploadArea onUploadComplete={handleUploadComplete} />
        </Card>
      </Section>
    </Container>
  );
}
