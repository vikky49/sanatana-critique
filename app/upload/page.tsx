'use client';

import { useState } from 'react';
import { Container, PageHeader, Section } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import UploadArea from '@/components/upload/UploadArea';
import ProcessingStatus from '@/components/upload/ProcessingStatus';

export default function UploadPage() {
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(null);

  const handleUploadComplete = (documentId: string) => {
    setUploadedDocumentId(documentId);
  };

  const handleReset = () => {
    setUploadedDocumentId(null);
  };

  return (
    <Container>
      <PageHeader
        title="Upload Religious Text"
        description="Upload a PDF, TXT, or JSON file containing a religious text for analysis"
      />
      
      <Section>
        {!uploadedDocumentId ? (
          <Card>
            <UploadArea onUploadComplete={handleUploadComplete} />
          </Card>
        ) : (
          <>
            <ProcessingStatus documentId={uploadedDocumentId} />
            <div className="mt-6 flex justify-center">
              <Button variant="outline" size="md" onClick={handleReset}>
                Upload Another Document
              </Button>
            </div>
          </>
        )}
      </Section>
    </Container>
  );
}
