import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const databaseUrl = readDatabaseUrl(path.join(root, '.env'));

pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1114, (value) => value);
pg.types.setTypeParser(1184, (value) => value);
pg.types.setTypeParser(114, (value) => value);
pg.types.setTypeParser(3802, (value) => value);

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const tables = (
  await client.query(
    `SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
     ORDER BY tablename`,
  )
).rows.map((row) => row.tablename);

const columnsByTable = new Map();
for (const table of tables) {
  const columns = (
    await client.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      [table],
    )
  ).rows;
  columnsByTable.set(table, columns);
}

const stamp = new Date();
const pad = (n) => String(n).padStart(2, '0');
const name = `waypoint-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.sql`;
const outDir = path.join(root, 'backups');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, name);

const lines = [
  '-- Waypoint database data. Loading this file replaces rows in the waypoint database.',
  'BEGIN;',
  `TRUNCATE TABLE ${tables.map(quoteIdent).join(', ')} RESTART IDENTITY CASCADE;`,
];

const counts = [];
for (const table of tables) {
  const columns = columnsByTable.get(table);
  const rows = (await client.query(`SELECT * FROM ${quoteIdent(table)}`)).rows;
  counts.push(`${table}: ${rows.length}`);
  if (rows.length === 0) continue;
  const colList = columns.map((column) => quoteIdent(column.column_name)).join(', ');
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const values = chunk
      .map(
        (row) =>
          `(${columns
            .map((column) => literal(row[column.column_name], column.data_type))
            .join(', ')})`,
      )
      .join(',\n');
    lines.push(
      `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES\n${values};`,
    );
  }
}

const sequences = (
  await client.query(
    `SELECT n.nspname AS schema, s.relname AS sequence, t.relname AS table, a.attname AS column
     FROM pg_class s
     JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a'
     JOIN pg_class t ON d.refobjid = t.oid
     JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
     JOIN pg_namespace n ON n.oid = s.relnamespace
     WHERE s.relkind = 'S' AND n.nspname = 'public'`,
  )
).rows;
for (const sequence of sequences) {
  lines.push(
    `SELECT setval(${sqlString(`${sequence.schema}.${sequence.sequence}`)}, COALESCE((SELECT MAX(${quoteIdent(sequence.column)}) FROM ${quoteIdent(sequence.table)}), 1), true);`,
  );
}

lines.push('COMMIT;', '');
fs.writeFileSync(outFile, lines.join('\n'));
await client.end();

console.log(counts.join('\n'));
console.log(`\nWrote ${outFile}`);

function readDatabaseUrl(envFile) {
  const text = fs.readFileSync(envFile, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^DATABASE_URL=(.*)$/);
    if (!match) continue;
    return match[1].trim().replace(/^['"]|['"]$/g, '');
  }
  throw new Error(`DATABASE_URL not found in ${envFile}`);
}

function quoteIdent(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function literal(value, dataType) {
  if (value === null || value === undefined) return 'NULL';
  if (dataType === 'ARRAY') {
    const items = Array.isArray(value) ? value : [];
    return `ARRAY[${items.map((item) => literal(item, 'text')).join(', ')}]`;
  }
  if (dataType === 'json' || dataType === 'jsonb') {
    const json = typeof value === 'string' ? value : JSON.stringify(value);
    return `${sqlString(json)}::jsonb`;
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'bigint') return value.toString();
  if (
    dataType === 'integer' ||
    dataType === 'bigint' ||
    dataType === 'smallint' ||
    dataType === 'numeric' ||
    dataType === 'decimal' ||
    dataType === 'real' ||
    dataType === 'double precision'
  ) {
    return String(value);
  }
  return sqlString(value);
}
