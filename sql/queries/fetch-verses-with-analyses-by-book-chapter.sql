-- Fetch verses with analyses filtered by book and chapter
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
LEFT JOIN analyses a ON v.id = a.verse_id
WHERE v.book_id = $1 AND v.chapter_number = $2
ORDER BY v.book_id, v.chapter_number, v.verse_number;
