INSERT INTO chapters (
  book_id, 
  number, 
  title, 
  verse_count
)
VALUES ($1, $2, $3, $4)
RETURNING *
