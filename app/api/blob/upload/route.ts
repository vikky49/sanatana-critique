import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextResponse } from 'next/server';

const ALLOWED_TYPES = ['text/plain', 'application/pdf', 'application/json'];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: Request): Promise<NextResponse> {
    const body = (await request.json()) as HandleUploadBody;

    try {
        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async (pathname) => {
                return {
                    allowedContentTypes: ALLOWED_TYPES,
                    maximumSizeInBytes: MAX_FILE_SIZE,
                };
            },
            onUploadCompleted: async ({ blob }) => {
                console.log('Blob upload completed:', blob.url);
            },
        });

        return NextResponse.json(jsonResponse);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        console.error('Blob upload error:', error);
        return NextResponse.json({ error: message }, { status: 400 });
    }
}
