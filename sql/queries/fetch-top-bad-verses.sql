-- Fetch top "bad" verses by problematic_score with optional filters
SELECT 
  v.id,
  v.book_id,
  v.chapter_number,
  v.verse_number,
  v.original_text,
  v.translation,
  v.analyzed,
  b.title as book_title,
  a.id as analysis_id,
  a.model,
  a.generated_at,
  a.modern_ethics,
  a.gender_analysis,
  a.caste_analysis,
  a.contradictions,
  a.problematic_score,
  a.tags,
  a.summary
FROM verses v
JOIN books b ON v.book_id = b.id
JOIN analyses a ON v.id = a.verse_id
WHERE a.problematic_score >= $1
  AND ($2::uuid IS NULL OR v.book_id = $2)
  AND (COALESCE($3::text[], '{}') = '{}' OR a.tags && $3::text[])
ORDER BY a.problematic_score DESC, v.chapter_number, v.verse_number
LIMIT $4;