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
  modernEthics?: string;
  genderAnalysis?: string;
  casteAnalysis?: string;
  contradictions?: string;
  model?: string;
  generatedAt?: string;
}

export interface VerseCardProps {
  verse: VerseInfo;
  analysis: AnalysisInfo;
}

export default function VerseCard({ verse, analysis }: VerseCardProps) {
  const [open, setOpen] = React.useState(false);
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

      <div className="flex items-center gap-2">
        <button
          className="text-xs text-blue-600 underline"
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide details' : 'Show details'}
        </button>
        {analysis.model && (
          <span className="text-[10px] text-gray-500">{analysis.model}</span>
        )}
      </div>

      {open && (
        <div className="space-y-2 text-sm">
          {analysis.modernEthics && (
            <div>
              <h4 className="font-medium">Modern Ethics</h4>
              <p className="text-gray-700 whitespace-pre-wrap">{analysis.modernEthics}</p>
            </div>
          )}
          {analysis.genderAnalysis && (
            <div>
              <h4 className="font-medium">Gender</h4>
              <p className="text-gray-700 whitespace-pre-wrap">{analysis.genderAnalysis}</p>
            </div>
          )}
          {analysis.casteAnalysis && (
            <div>
              <h4 className="font-medium">Caste / Hierarchy</h4>
              <p className="text-gray-700 whitespace-pre-wrap">{analysis.casteAnalysis}</p>
            </div>
          )}
          {analysis.contradictions && (
            <div>
              <h4 className="font-medium">Contradictions</h4>
              <p className="text-gray-700 whitespace-pre-wrap">{analysis.contradictions}</p>
            </div>
          )}
        </div>
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
