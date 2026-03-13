import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);

async function inspectDatabase() {
  console.log('Database Inspection\n');
  
  // Check books
  const books = await sql`
    SELECT id, title, total_chapters, total_verses 
    FROM books
  `;
  console.log(`Books: ${books.length}`);
  books.forEach(b => {
    console.log(
      `  - ${b.title}: ` +
      `${b.total_chapters} chapters, ` +
      `${b.total_verses} verses`
    );
  });
  
  if (books.length > 0) {
    const bookId = books[0].id;
    console.log(`\nInspecting book: ${bookId}\n`);
    
    // Check chapters
    const chapters = await sql`
      SELECT number, title, verse_count 
      FROM chapters 
      WHERE book_id = ${bookId}
      ORDER BY number
    `;
    console.log(`Chapters: ${chapters.length}`);
    chapters.forEach(c => {
      console.log(
        `  Ch ${c.number}: "${c.title}" - ${c.verse_count} verses`
      );
    });
    
    // Check verses per chapter
    console.log('\nVerses per chapter (from verses table):');
    const verseCounts = await sql`
      SELECT chapter_number, COUNT(*) as count
      FROM verses
      WHERE book_id = ${bookId}
      GROUP BY chapter_number
      ORDER BY chapter_number
    `;
    verseCounts.forEach(v => {
      console.log(`  Ch ${v.chapter_number}: ${v.count} verses`);
    });
    
    // Sample verses from chapter 10
    console.log('\nSample verses from Chapter 10:');
    const sampleVerses = await sql`
      SELECT verse_number, 
             LEFT(original_text, 80) as text_preview
      FROM verses
      WHERE book_id = ${bookId} 
        AND chapter_number = 10
      ORDER BY verse_number
      LIMIT 5
    `;
    sampleVerses.forEach(v => {
      console.log(`  Verse ${v.verse_number}: ${v.text_preview}...`);
    });
    
    // Check total verses in DB
    const totalVerses = await sql`
      SELECT COUNT(*) as count FROM verses WHERE book_id = ${bookId}
    `;
    console.log(`\nTotal verses in database: ${totalVerses[0].count}`);

    // Check analyses counts
    const totalAnalyses = await sql`
      SELECT COUNT(*) as count FROM analyses a
      JOIN verses v ON a.verse_id = v.id
      WHERE v.book_id = ${bookId}
    `;
    console.log(`Total analyses for this book: ${totalAnalyses[0].count}`);

    // Show top analyzed verses by score
    const topAnalyzed = await sql`
      SELECT v.chapter_number, v.verse_number, a.problematic_score, a.tags
      FROM analyses a
      JOIN verses v ON a.verse_id = v.id
      WHERE v.book_id = ${bookId}
      ORDER BY a.problematic_score DESC
      LIMIT 5
    `;
    console.log('\nTop analyzed verses (sample):');
    topAnalyzed.forEach(r => {
      const tags = Array.isArray(r.tags) ? r.tags.join(',') : String(r.tags);
      console.log(
        `  Ch ${r.chapter_number}:$${r.verse_number} score=${r.problematic_score} tags=[${tags}]`
      );
    });
    
    // Check processing logs for clues
    console.log('\nRecent processing logs (last 10):');
    const logs = await sql`
      SELECT level, message, metadata
      FROM processing_logs
      ORDER BY created_at DESC
      LIMIT 10
    `;
    logs.forEach(log => {
      const meta = log.metadata ? 
        JSON.stringify(log.metadata) : '';
      console.log(`  [${log.level}] ${log.message} ${meta}`);
    });
  }
}

inspectDatabase().catch(console.error);
