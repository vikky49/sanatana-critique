import { neon } from '@neondatabase/serverless';
import type { Database } from './db';
import type { Document } from '@/types';

let sql: ReturnType<typeof neon> | null = null;

function getSql() {
  if (!sql) {
    sql = neon(process.env.DATABASE_URL!);
  }
  return sql;
}

export class NeonDatabase implements Database {
  async createDocument(doc: Omit<Document, 'id' | 'uploadedAt'>): Promise<Document> {
    const result = await getSql()`
      INSERT INTO documents (filename, title, file_type, size, status, raw_text_url)
      VALUES (${doc.filename}, ${doc.title}, ${doc.fileType}, ${doc.size}, ${doc.status}, ${doc.rawTextUrl})
      RETURNING *
    ` as any[];

    const row = result[0];
    return {
      id: row.id,
      filename: row.filename,
      title: row.title,
      fileType: row.file_type,
      size: row.size,
      uploadedAt: new Date(row.uploaded_at),
      status: row.status as Document['status'],
      rawTextUrl: row.raw_text_url,
    };
  }

  async getDocument(id: string): Promise<Document | null> {
    const result = await getSql()`
      SELECT * FROM documents WHERE id = ${id}
    ` as any[];

    if (result.length === 0) return null;

    const row = result[0];
    return {
      id: row.id,
      filename: row.filename,
      title: row.title,
      fileType: row.file_type,
      size: row.size,
      uploadedAt: new Date(row.uploaded_at),
      status: row.status as Document['status'],
      rawTextUrl: row.raw_text_url,
    };
  }

  async updateDocumentStatus(id: string, status: Document['status']): Promise<void> {
    await getSql()`
      UPDATE documents SET status = ${status} WHERE id = ${id}
    `;
  }

  // Placeholder implementations - we'll add these as needed
  async createBook(book: any): Promise<any> {
    throw new Error('Not implemented yet');
  }

  async getBook(id: string): Promise<any> {
    throw new Error('Not implemented yet');
  }

  async listBooks(): Promise<any[]> {
    throw new Error('Not implemented yet');
  }

  async updateBook(id: string, updates: any): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async createChapter(chapter: any): Promise<any> {
    throw new Error('Not implemented yet');
  }

  async getChaptersByBook(bookId: string): Promise<any[]> {
    throw new Error('Not implemented yet');
  }

  async createVerse(verse: any): Promise<any> {
    throw new Error('Not implemented yet');
  }

  async getVerse(id: string): Promise<any> {
    throw new Error('Not implemented yet');
  }

  async getVersesByChapter(bookId: string, chapterNumber: number): Promise<any[]> {
    throw new Error('Not implemented yet');
  }

  async getVersesByBook(bookId: string): Promise<any[]> {
    throw new Error('Not implemented yet');
  }

  async updateVerseAnalysisStatus(id: string, analyzed: boolean): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async createAnalysis(analysis: any): Promise<any> {
    throw new Error('Not implemented yet');
  }

  async getAnalysisByVerse(verseId: string): Promise<any> {
    throw new Error('Not implemented yet');
  }

  async getAnalysesByBook(bookId: string): Promise<any[]> {
    throw new Error('Not implemented yet');
  }

  async createJob(job: any): Promise<any> {
    throw new Error('Not implemented yet');
  }

  async getJob(id: string): Promise<any> {
    throw new Error('Not implemented yet');
  }

  async updateJob(id: string, updates: any): Promise<void> {
    throw new Error('Not implemented yet');
  }

  async listActiveJobs(): Promise<any[]> {
    throw new Error('Not implemented yet');
  }

  async searchVerses(params: any): Promise<any[]> {
    throw new Error('Not implemented yet');
  }

  async semanticSearch(embedding: number[], limit: number): Promise<any[]> {
    throw new Error('Not implemented yet');
  }
}
