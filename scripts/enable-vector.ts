import { config } from 'dotenv';
import { Client } from 'pg';

config({ path: '.env.development.local' });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL');
}

async function enableVector() {
  const client = new Client({ connectionString: databaseUrl });
  
  try {
    await client.connect();
    
    process.stdout.write('Enabling pgvector extension...\n');
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    
    process.stdout.write('pgvector enabled successfully\n');
    await client.end();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    process.stderr.write(`Error: ${message}\n`);
    await client.end();
    process.exit(1);
  }
}

enableVector();
