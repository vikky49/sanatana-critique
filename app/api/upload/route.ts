import { NextRequest, NextResponse } from 'next/server';
import { InMemoryDatabase } from '@/lib/db';

const db = new InMemoryDatabase();

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { message: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const allowedTypes = ['text/plain', 'application/pdf', 'application/json'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { message: 'Invalid file type. Please upload PDF, TXT, or JSON files.' },
        { status: 400 }
      );
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { message: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      );
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const text = buffer.toString('utf-8');

    // Create document record
    const document = await db.createDocument({
      filename: file.name,
      fileType: file.type,
      size: file.size,
      status: 'uploaded',
      rawTextUrl: `data:${file.type};base64,${buffer.toString('base64')}`,
    });

    return NextResponse.json({
      documentId: document.id,
      filename: document.filename,
      size: document.size,
      status: document.status,
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { message: 'Upload failed. Please try again.' },
      { status: 500 }
    );
  }
}
