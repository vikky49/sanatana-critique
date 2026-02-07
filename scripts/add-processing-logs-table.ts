import {config} from 'dotenv';
import {Client} from 'pg';

config({path: '.env.development.local'});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL environment variable');
}

async function migrate() {
    const client = new Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 30000,
    });

    try {
        process.stdout.write('Connecting to database...\n');
        await client.connect();

        process.stdout.write('Creating processing_logs table...\n');

        await client.query(`
            CREATE TABLE IF NOT EXISTS processing_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
                level TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_processing_logs_document 
            ON processing_logs(document_id, created_at)
        `);

        process.stdout.write('Migration complete!\n');
        await client.end();
        process.exit(0);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        process.stderr.write(`Error: ${message}\n`);
        await client.end();
        process.exit(1);
    }
}

migrate();
