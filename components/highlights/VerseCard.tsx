import React from 'react';
import { Card, Badge } from '../ui';
import ScoreBadge from './ScoreBadge';
import TagPill from './TagPill';

export interface VerseInfo {
  id: string;
  bookTitle: string;
  chapterNumber: number;
  verseNumber: number;
  originalText: string;
  translation: string;
}

export interface AnalysisInfo {
  problematicScore: number;
  tags: string[];
  summary?: string;
}

export interface VerseCardProps {
  verse: VerseInfo;
  analysis: AnalysisInfo;
}

export default function VerseCard({ verse, analysis }: VerseCardProps) {
  return (
    <Card className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">{verse.bookTitle} {verse.chapterNumber}:{verse.verseNumber}</h3>
          <Badge variant="gray" size="sm">Verse #{verse.verseNumber}</Badge>
        </div>
        <ScoreBadge score={analysis.problematicScore} />
      </div>

      <p className="text-sm text-gray-700 whitespace-pre-wrap">{verse.translation}</p>
      {verse.originalText && (
        <p className="text-xs text-gray-500 italic whitespace-pre-wrap">{verse.originalText}</p>
      )}

      {analysis.summary && (
        <p className="text-sm">{analysis.summary}</p>
      )}

      {analysis.tags?.length ? (
        <div className="flex flex-wrap gap-2">
          {analysis.tags.map((t) => (
            <TagPill key={t} tag={t} />
          ))}
        </div>
      ) : null}
    </Card>
  );
}
