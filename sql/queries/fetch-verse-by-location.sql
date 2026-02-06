-- Fetch a specific verse by book, chapter, and verse number
SELECT v.*, b.title as book_title
FROM verses v
JOIN books b ON v.book_id = b.id
WHERE v.book_id = $1
  AND v.chapter_number = $2
  AND v.verse_number = $3;
