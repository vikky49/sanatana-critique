"use client";
import React from 'react';
import { Button } from '../ui';

export interface FilterBarProps {
  minScore: number;
  limit: number;
  tags: string;
  onChange: (
    next: { minScore?: number; limit?: number; tags?: string }
  ) => void;
  onRefresh: () => void;
  onReanalyze?: () => Promise<void> | void;
}

export default function FilterBar({
  minScore,
  limit,
  tags,
  onChange,
  onRefresh,
  onReanalyze,
}: FilterBarProps) {
  return (
    <div className="flex items-end gap-4">
      <div>
        <label className="block text-sm font-medium">Min Score</label>
        <input
          type="number"
          min={0}
          max={100}
          value={minScore}
          onChange={(e) => onChange({ minScore: parseInt(e.target.value || '0', 10) })}
          className="input"
        />
      </div>
      <div>
        <label className="block text-sm font-medium">Limit</label>
        <input
          type="number"
          min={1}
          max={100}
          value={limit}
          onChange={(e) => onChange({ limit: parseInt(e.target.value || '1', 10) })}
          className="input"
        />
      </div>
      <div className="flex-1">
        <label className="block text-sm font-medium">Filter Tags (comma-separated)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => onChange({ tags: e.target.value })}
          placeholder="e.g. caste,violence,gender"
          className="input w-full"
        />
      </div>
      <Button variant="secondary" size="md" onClick={onRefresh}>
        Refresh
      </Button>
      {onReanalyze && (
        <Button
          variant="primary"
          size="md"
          onClick={() => void onReanalyze()}
        >
          Re-analyze Missing
        </Button>
      )}
    </div>
  );
}
