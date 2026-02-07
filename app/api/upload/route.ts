import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { NeonDatabase } from '@/lib/neon-db';

const db = new NeonDatabase();

const ALLOWED_TYPES = ['text/plain', 'application/pdf', 'application/json'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
        return 'Invalid file type. Please upload PDF, TXT, or JSON files.';
    }
    if (file.size > MAX_FILE_SIZE) {
        return 'File too large. Maximum size is 50MB.';
    }
    return null;
};

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ message: 'No file provided' }, { status: 400 });
        }

        const validationError = validateFile(file);
        if (validationError) {
            return NextResponse.json({ message: validationError }, { status: 400 });
        }

        // Upload to Vercel Blob
        const blob = await put(`documents/${Date.now()}-${file.name}`, file, {
            access: 'public',
            addRandomSuffix: true,
        });

        // Create document record with blob URL
        const document = await db.createDocument({
            filename: file.name,
            fileType: file.type,
            size: file.size,
            status: 'uploaded',
            rawTextUrl: blob.url,
        });

        // Trigger processing asynchronously
        const baseUrl = request.nextUrl.origin;
        fetch(`${baseUrl}/api/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documentId: document.id }),
        }).catch(err => console.error('Failed to trigger processing:', err));

        return NextResponse.json({
            documentId: document.id,
            filename: document.filename,
            size: document.size,
            status: 'processing',
        });
    } catch (error) {
        console.error('Upload error:', error);
        const message = error instanceof Error ? error.message : 'Upload failed';
        return NextResponse.json({ message }, { status: 500 });
    }
}
