import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL!);

async function clearDatabase() {
  console.log('Clearing database...');
  
  // Clear in order respecting foreign keys
  try { await sql`DELETE FROM processing_logs`; console.log('✓ Cleared processing_logs'); } catch { console.log('⚠ processing_logs skipped'); }
  try { await sql`DELETE FROM verse_analyses`; console.log('✓ Cleared verse_analyses'); } catch { console.log('⚠ verse_analyses skipped'); }
  try { await sql`DELETE FROM verses`; console.log('✓ Cleared verses'); } catch { console.log('⚠ verses skipped'); }
  try { await sql`DELETE FROM chapters`; console.log('✓ Cleared chapters'); } catch { console.log('⚠ chapters skipped'); }
  try { await sql`DELETE FROM documents`; console.log('✓ Cleared documents'); } catch { console.log('⚠ documents skipped'); }
  
  console.log('\nDatabase cleared successfully!');
}

clearDatabase().catch(console.error);
