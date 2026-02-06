import {config} from 'dotenv';
import {Client} from 'pg';
import {SQL_SCHEMA} from '../lib/db';

config({path: '.env.development.local'});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error('Missing DATABASE_URL environment variable');
}

async function checkTablesExist(client: Client): Promise<boolean> {
    try {
        await client.query('SELECT 1 FROM documents LIMIT 1');
        return true;
    } catch {
        return false;
    }
}

async function init() {
    const client = new Client({
        connectionString: databaseUrl,
        connectionTimeoutMillis: 30000,
    });

    try {
        process.stdout.write('Connecting to database...\n');
        await client.connect();

        const tablesExist = await checkTablesExist(client);

        if (tablesExist) {
            process.stdout.write('Database tables already exist\n');
            await client.end();
            process.exit(0);
        }

        process.stdout.write('Creating database tables...\n');

        // Remove comments and split by semicolon
        const cleanedSchema = SQL_SCHEMA
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n');

        const statements = cleanedSchema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            try {
                await client.query(statement);
            } catch (err) {
                if (err instanceof Error && !err.message.includes('already exists')) {
                    throw err;
                }
            }
        }

        process.stdout.write('Database initialized successfully\n');
        await client.end();
        process.exit(0);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        process.stderr.write(`Error: ${message}\n`);
        await client.end();
        process.exit(1);
    }
}

init();
