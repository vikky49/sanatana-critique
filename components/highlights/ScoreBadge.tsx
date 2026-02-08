import React from 'react';
import { Badge } from '../ui';

export interface ScoreBadgeProps {
  score: number;
}

function tone(score: number): 'green' | 'yellow' | 'red' | 'gray' {
  if (Number.isNaN(score)) return 'gray';
  if (score >= 80) return 'red';
  if (score >= 60) return 'yellow';
  return 'green';
}

export default function ScoreBadge({ score }: ScoreBadgeProps) {
  const variant = tone(score);
  return <Badge variant={variant as any} size="sm">Score: {Math.round(score)}</Badge>;
}
