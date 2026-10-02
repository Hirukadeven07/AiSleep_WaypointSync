import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node import-db.mjs path\\to\\waypoint.sql');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const databaseUrl = readDatabaseUrl(path.join(root, '.env'));
const sql = fs.readFileSync(file, 'utf8');
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
await client.query(sql);
const users = await client.query('SELECT COUNT(*)::int AS n FROM "User"');
await client.end();
console.log(`Loaded ${path.resolve(file)}`);
console.log(`User rows now: ${users.rows[0].n}`);

function readDatabaseUrl(envFile) {
  const text = fs.readFileSync(envFile, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^DATABASE_URL=(.*)$/);
    if (!match) continue;
    return match[1].trim().replace(/^['"]|['"]$/g, '');
  }
  throw new Error(`DATABASE_URL not found in ${envFile}`);
}
