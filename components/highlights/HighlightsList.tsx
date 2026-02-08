import React from 'react';
import VerseCard, { VerseInfo } from './VerseCard';

export interface HighlightsItem {
  verse: VerseInfo & { analyzed: boolean };
  analysis: {
    problematicScore: number;
    tags: string[];
    summary?: string;
    id?: string;
    model?: string;
    generatedAt?: string;
  };
}

export interface HighlightsListProps {
  items: HighlightsItem[];
}

export default function HighlightsList({ items }: HighlightsListProps) {
  if (!items.length) return <p>No highlights yet.</p>;
  return (
    <div className="space-y-4">
      {items.map((it) => (
        <VerseCard key={it.verse.id} verse={it.verse} analysis={it.analysis} />
      ))}
    </div>
  );
}
