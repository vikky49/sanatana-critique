import React from 'react';

export interface TagPillProps {
  tag: string;
}

export default function TagPill({ tag }: TagPillProps) {
  return (
    <span className="badge badge-gray badge-sm" title={tag}>
      {tag}
    </span>
  );
}
