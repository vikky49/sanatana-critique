'use client';

import { useEffect, useMemo, useState } from 'react';
import { HighlightsList, FilterBar, type HighlightsItem } from '@/components/highlights';
import { PageHeader, Container, Section } from '@/components/layout';

export default function HighlightsPage() {
  const [items, setItems] = useState<HighlightsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minScore, setMinScore] = useState(0);
  const [limit, setLimit] = useState(20);
  const [tags, setTags] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('minScore', String(minScore));
    p.set('limit', String(limit));
    if (tags.trim()) p.set('tags', tags);
    return p.toString();
  }, [minScore, limit, tags]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/highlights?${qs}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((data) => {
        if (!cancelled) {
          if (data.error) setError(data.error); else setItems(data.items || []);
        }
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [qs, refreshKey]);

  return (
    <Container>
      <PageHeader 
        title="Top 20 Most Irrelevant Verses for 2026" 
        description="Verses that conflict most with modern ethical standards and 2026 values" 
      />

      <Section>
        <FilterBar
          minScore={minScore}
          limit={limit}
          tags={tags}
          onChange={(n) => {
            if (n.minScore !== undefined) setMinScore(n.minScore);
            if (n.limit !== undefined) setLimit(n.limit);
            if (n.tags !== undefined) setTags(n.tags);
          }}
          onRefresh={() => setRefreshKey(k => k + 1)}
        />
      </Section>

      <Section>
        {loading && <p>Loading…</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && !error && <HighlightsList items={items} />}
      </Section>
    </Container>
  );
}
