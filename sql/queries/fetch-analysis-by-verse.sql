-- Fetch the most recent analysis for a verse
SELECT * FROM analyses
WHERE verse_id = $1
ORDER BY generated_at DESC
LIMIT 1;
