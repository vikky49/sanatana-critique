import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function fixProcessingLogsTable() {
    const sql = neon(process.env.DATABASE_URL!);
    
    console.log('Checking processing_logs table columns...');
    
    // Check current columns
    const cols = await sql`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'processing_logs'
    `;
    console.log('Current columns:', cols.map((c: { column_name: string }) => c.column_name));
    
    const hasContext = cols.some((c: { column_name: string }) => c.column_name === 'context');
    const hasMetadata = cols.some((c: { column_name: string }) => c.column_name === 'metadata');
    
    if (hasContext && !hasMetadata) {
        console.log('Renaming context -> metadata...');
        await sql`ALTER TABLE processing_logs RENAME COLUMN context TO metadata`;
        console.log('Done!');
    } else if (!hasMetadata) {
        console.log('Adding metadata column...');
        await sql`ALTER TABLE processing_logs ADD COLUMN metadata JSONB`;
        console.log('Done!');
    } else {
        console.log('metadata column already exists, no changes needed');
    }
}

fixProcessingLogsTable().catch(console.error);
