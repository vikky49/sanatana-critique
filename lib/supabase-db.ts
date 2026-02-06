import { supabase } from './supabase';
import type { Database } from './db';
import type { Document } from '@/types';

export class SupabaseDatabase implements Database {
  async createDocument(doc: Omit<Document, 'id' | 'uploadedAt'>): Promise<Document> {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        filename: doc.filename,
        title: doc.title,
        file_type: doc.fileType,
        size: doc.size,
        status: doc.status,
        raw_text_url: doc.rawTextUrl,
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create document: ${error.message}`);

    return {
      id: data.id,
      filename: data.filename,
      title: data.title,
      fileType: data.file_type,
      size: data.size,
      uploadedAt: new Date(data.uploaded_at),
      status: data.status as Document['status'],
      rawTextUrl: data.raw_text_url,
    };
  }

  async getDocument(id: string): Promise<Document | null> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    if (!data) return null;

    return {
      id: data.id,
      filename: data.filename,
      title: data.title,
      fileType: data.file_type,
      size: data.size,
      uploadedAt: new Date(data.uploaded_at),
      status: data.status as Document['status'],
      rawTextUrl: data.raw_text_url,
    };
  }

  async updateDocumentStatus(id: string, status: Document['status']): Promise<void> {
    await supabase
      .from('documents')
      .update({ status })
      .eq('id', id);
  }

  // Placeholder implementations for other methods
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
