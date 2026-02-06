INSERT INTO verses (
  book_id, 
  chapter_number, 
  verse_number, 
  original_text, 
  translation
)
VALUES ($1, $2, $3, $4, $5)
RETURNING *
