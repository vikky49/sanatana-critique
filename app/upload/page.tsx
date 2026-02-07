'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Container, PageHeader, Section } from '@/components/layout';
import { Card, Button } from '@/components/ui';
import UploadArea from '@/components/upload/UploadArea';
import ProcessingStatus from '@/components/upload/ProcessingStatus';

function UploadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [uploadedDocumentId, setUploadedDocumentId] = useState<string | null>(
    () => searchParams.get('documentId')
  );

  const handleUploadComplete = (documentId: string) => {
    setUploadedDocumentId(documentId);
    router.push(`/upload?documentId=${documentId}`);
  };

  const handleReset = () => {
    setUploadedDocumentId(null);
    router.push('/upload');
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

export default function UploadPage() {
  return (
    <Suspense fallback={
      <Container>
        <PageHeader
          title="Upload Religious Text"
          description="Upload a PDF, TXT, or JSON file containing a religious text for analysis"
        />
        <Section>
          <Card>
            <div className="text-center py-8">Loading...</div>
          </Card>
        </Section>
      </Container>
    }>
      <UploadPageContent />
    </Suspense>
  );
}
