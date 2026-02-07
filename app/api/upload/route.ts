import { NextRequest, NextResponse } from 'next/server';
import { NeonDatabase } from '@/lib/neon-db';

const db = new NeonDatabase();

export async function POST(request: NextRequest) {
    try {
        const { blobUrl, filename, fileType, size } = await request.json();

        if (!blobUrl || !filename) {
            return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
        }

        // Create document record with blob URL
        const document = await db.createDocument({
            filename,
            fileType: fileType || 'application/octet-stream',
            size: size || 0,
            status: 'uploaded',
            rawTextUrl: blobUrl,
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
