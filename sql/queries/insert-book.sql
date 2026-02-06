INSERT INTO books (
  document_id, 
  title, 
  description, 
  language, 
  total_chapters, 
  total_verses, 
  processed_at
)
VALUES ($1, $2, $3, $4, $5, $6, NOW())
RETURNING *
