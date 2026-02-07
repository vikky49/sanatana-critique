import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function fixProcessingLogsTable() {
    const sql = neon(process.env.DATABASE_URL!);
    
    console.log('Checking processing_logs table columns...');
    
    // Check current columns
    const rows = (await sql`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'processing_logs'
    `) as Array<{ column_name: string }>;

    const colNames = rows.map((r) => r.column_name);
    console.log('Current columns:', colNames);
    
    const hasContext = colNames.includes('context');
    const hasMetadata = colNames.includes('metadata');
    
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
