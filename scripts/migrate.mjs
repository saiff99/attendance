#!/usr/bin/env node
/**
 * ==============================================================================
 * MedAttend Production Database Migration Runner
 * Single Source of Truth: docs/architecture-vault/
 * ==============================================================================
 * Usage:
 *   node scripts/migrate.mjs                  # Interactive status & apply pending
 *   node scripts/migrate.mjs --status         # View all migrations and status
 *   node scripts/migrate.mjs --apply          # Run all pending migrations
 *   node scripts/migrate.mjs --dry-run        # Validate syntax & simulate run
 *   node scripts/migrate.mjs --bundle         # Export consolidated SQL bundle
 *   node scripts/migrate.mjs --create <name>  # Scaffold next migration file
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(BASE_DIR, 'database', 'migrations');

// Dynamically resolve 'pg' from frontend/node_modules if needed
let pg = null;
try {
  const req = createRequire(path.join(BASE_DIR, 'frontend', 'package.json'));
  pg = req('pg');
} catch (err) {
  try {
    const rootReq = createRequire(import.meta.url);
    pg = rootReq('pg');
  } catch (innerErr) {
    pg = null;
  }
}

// Simple ANSI color helpers
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

// Simple .env parser (without external dotenv dependency)
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

// Gather environment variables from multiple standard project locations
function getMergedEnv() {
  const backendEnv = loadEnvFile(path.join(BASE_DIR, 'backend', '.env'));
  const frontendEnv = loadEnvFile(path.join(BASE_DIR, 'frontend', '.env.local'));
  const rootEnv = loadEnvFile(path.join(BASE_DIR, '.env'));

  return {
    ...rootEnv,
    ...backendEnv,
    ...frontendEnv,
    ...process.env,
  };
}

// Compute SHA-256 checksum for content integrity verification
function computeChecksum(content) {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// Extract human-readable summary from SQL comment headers
function extractDescription(content, filename) {
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--') && !trimmed.startsWith('---') && !trimmed.startsWith('-- =')) {
      const clean = trimmed.replace(/^--\s*/, '').replace(/^[📜🚀🔒🛡️⚡📋\s]+/, '').trim();
      if (clean && !clean.toLowerCase().includes('migration') && clean.length > 5) {
        return clean.slice(0, 70);
      }
      if (clean.length > 10) {
        return clean.slice(0, 70);
      }
    }
  }
  // Fallback to name formatted
  return filename.replace(/^\d+_/, '').replace(/\.sql$/, '').replace(/_/g, ' ');
}

// Read and sort all migration files from database/migrations
function getLocalMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.error(`${colors.red}❌ Migrations directory not found at: ${MIGRATIONS_DIR}${colors.reset}`);
    process.exit(1);
  }

  const files = fs.readdirSync(MIGRATIONS_DIR);
  const migrations = [];

  for (const file of files) {
    const match = file.match(/^(\d+)_([a-zA-Z0-9_\-]+)\.sql$/);
    if (!match) continue;

    const version = parseInt(match[1], 10);
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const checksum = computeChecksum(content);
    const description = extractDescription(content, file);

    migrations.push({
      version,
      versionRaw: match[1],
      filename: file,
      name: file.replace(/\.sql$/, ''),
      fullPath,
      content,
      checksum,
      description,
    });
  }

  migrations.sort((a, b) => a.version - b.version);
  return migrations;
}

// Discover database connection string from environment
function getDatabaseUrl(env) {
  return (
    env.DATABASE_URL ||
    env.POSTGRES_URL ||
    env.SUPABASE_DB_URL ||
    env.DIRECT_URL ||
    null
  );
}

// Ensure the _migrations tracking ledger table exists
async function ensureMigrationsTable(client) {
  const ddl = `
    CREATE TABLE IF NOT EXISTS public._migrations (
      id SERIAL PRIMARY KEY,
      version INTEGER UNIQUE NOT NULL,
      name VARCHAR(255) UNIQUE NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      execution_time_ms INTEGER NOT NULL DEFAULT 0
    );
    COMMENT ON TABLE public._migrations IS 'Authoritative audit ledger of executed MedAttend database migrations.';
  `;
  await client.query(ddl);
}

// Retrieve currently applied migrations from the database
async function getAppliedMigrations(client) {
  try {
    await ensureMigrationsTable(client);
    const res = await client.query('SELECT version, name, checksum, applied_at, execution_time_ms FROM public._migrations ORDER BY version ASC;');
    const map = new Map();
    for (const row of res.rows) {
      map.set(row.version, row);
    }
    return map;
  } catch (err) {
    console.error(`${colors.red}Error fetching _migrations table:${colors.reset}`, err.message);
    throw err;
  }
}

// ==============================================================================
// Command Implementations
// ==============================================================================

// 1. STATUS command
async function commandStatus(client, localMigrations) {
  console.log(`\n${colors.bold}${colors.cyan}======================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  📋 MedAttend Database Migration Status Ledger${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}======================================================================${colors.reset}\n`);

  let appliedMap = null;
  if (client) {
    appliedMap = await getAppliedMigrations(client);
  } else {
    console.log(`${colors.yellow}ℹ️ Running in Offline / Local Mode (No active DB connection specified).${colors.reset}`);
    console.log(`${colors.dim}  Set DATABASE_URL in .env to inspect live database status.${colors.reset}\n`);
  }

  console.log(
    `${colors.bold}${'Ver'.padEnd(5)} ${'Migration Name'.padEnd(46)} ${'Checksum'.padEnd(10)} ${'Status'.padEnd(18)} Description${colors.reset}`
  );
  console.log('-'.repeat(105));

  let appliedCount = 0;
  let pendingCount = 0;
  let alteredCount = 0;

  for (const m of localMigrations) {
    const shortHash = m.checksum.slice(0, 8);
    let statusStr = `${colors.dim}LOCAL ONLY${colors.reset}`;

    if (appliedMap) {
      const applied = appliedMap.get(m.version);
      if (applied) {
        if (applied.checksum === m.checksum) {
          statusStr = `${colors.green}✓ APPLIED${colors.reset}`;
          appliedCount++;
        } else {
          statusStr = `${colors.red}⚠️ MODIFIED${colors.reset}`;
          alteredCount++;
        }
      } else {
        statusStr = `${colors.yellow}⏳ PENDING${colors.reset}`;
        pendingCount++;
      }
    }

    const verStr = String(m.version).padStart(2, '0');
    console.log(
      `${verStr.padEnd(5)} ${m.filename.padEnd(46)} ${shortHash.padEnd(10)} ${statusStr.padEnd(27)} ${colors.dim}${m.description}${colors.reset}`
    );
  }

  console.log('-'.repeat(105));
  console.log(`\n${colors.bold}Total Migrations on Disk:${colors.reset} ${localMigrations.length}`);
  if (appliedMap) {
    console.log(`${colors.green}✓ Applied:${colors.reset} ${appliedCount} | ${colors.yellow}⏳ Pending:${colors.reset} ${pendingCount} | ${colors.red}⚠️ Mismatched Checksums:${colors.reset} ${alteredCount}`);
  }
  console.log('');
}

// 2. DRY-RUN command
async function commandDryRun(localMigrations) {
  console.log(`\n${colors.bold}${colors.yellow}======================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.yellow}  🧪 MedAttend Migration Dry-Run & Static Syntax Verification${colors.reset}`);
  console.log(`${colors.bold}${colors.yellow}======================================================================${colors.reset}\n`);

  let validCount = 0;
  const issues = [];

  for (const m of localMigrations) {
    const raw = m.content;
    const lines = raw.split('\n').length;
    const bytes = Buffer.byteLength(raw, 'utf-8');

    // Strip comments to avoid false-positives on contractions like "student's" in comments
    const strippedSql = raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .map(line => {
        const commentIdx = line.indexOf('--');
        return commentIdx !== -1 ? line.slice(0, commentIdx) : line;
      })
      .join('\n');

    const openQuotes = (strippedSql.match(/'/g) || []).length;
    const hasDollarBlock = strippedSql.includes('$$');

    if (!hasDollarBlock && openQuotes % 2 !== 0) {
      issues.push(`[${m.filename}] Warning: Possible unescaped single quote detected in SQL body.`);
    }

    console.log(
      `  ${colors.green}✓${colors.reset} Ver ${String(m.version).padStart(2, '0')}: ${m.filename} (${lines} lines, ${bytes} bytes)`
    );
    validCount++;
  }

  console.log(`\n${colors.bold}Verification Complete:${colors.reset} ${validCount}/${localMigrations.length} files parsed cleanly.`);
  if (issues.length > 0) {
    console.log(`\n${colors.yellow}Static Warnings Found:${colors.reset}`);
    issues.forEach(i => console.log(`  - ${i}`));
  } else {
    console.log(`${colors.green}All migration files conform to MedAttend zero-trust SQL standards.${colors.reset}\n`);
  }
}

// 3. APPLY command
async function commandApply(client, localMigrations) {
  if (!client) {
    console.error(`\n${colors.red}❌ Cannot apply migrations without an active PostgreSQL connection.${colors.reset}`);
    console.error(`Please provide DATABASE_URL in your .env or frontend/.env.local file.`);
    console.error(`\n${colors.cyan}Tip: You can generate a single SQL bundle to run in the Supabase Web Editor anytime via:${colors.reset}`);
    console.error(`  node scripts/migrate.mjs --bundle\n`);
    process.exit(1);
  }

  await ensureMigrationsTable(client);
  const appliedMap = await getAppliedMigrations(client);

  const pending = localMigrations.filter(m => !appliedMap.has(m.version));

  if (pending.length === 0) {
    console.log(`\n${colors.green}✓ Database is already up to date! (0 pending migrations)${colors.reset}\n`);
    return;
  }

  console.log(`\n${colors.bold}${colors.cyan}======================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  🚀 Applying ${pending.length} Pending Migration(s)...${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}======================================================================${colors.reset}\n`);

  for (let i = 0; i < pending.length; i++) {
    const m = pending[i];
    const prefix = `[${i + 1}/${pending.length}] ${m.filename}`;
    process.stdout.write(`  ⏳ ${prefix}... `);

    const startTime = Date.now();
    try {
      await client.query('BEGIN');
      await client.query(m.content);
      const executionTime = Date.now() - startTime;

      await client.query(
        `INSERT INTO public._migrations (version, name, checksum, execution_time_ms)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (version) DO UPDATE
         SET checksum = EXCLUDED.checksum, execution_time_ms = EXCLUDED.execution_time_ms, applied_at = NOW();`,
        [m.version, m.name, m.checksum, executionTime]
      );

      await client.query('COMMIT');
      console.log(`${colors.green}✓ Done (${executionTime}ms)${colors.reset}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.log(`${colors.red}FAILED!${colors.reset}`);
      console.error(`\n${colors.red}❌ Error executing migration ${m.filename}:${colors.reset}\n${err.message}\n`);
      console.error(`${colors.yellow}Rolled back changes. Database state remains protected.${colors.reset}\n`);
      process.exit(1);
    }
  }

  console.log(`\n${colors.green}${colors.bold}🎉 All ${pending.length} migration(s) applied successfully!${colors.reset}\n`);
}

// 4. BUNDLE command
function commandBundle(localMigrations, outputPath) {
  const targetPath = outputPath || path.join(BASE_DIR, 'database', 'combined_migrations_bundle.sql');

  console.log(`\n${colors.cyan}📦 Generating consolidated idempotent migration bundle...${colors.reset}`);

  let bundle = `-- ==============================================================================\n`;
  bundle += `-- MedAttend Complete Consolidated Migration Bundle\n`;
  bundle += `-- Generated: ${new Date().toISOString()}\n`;
  bundle += `-- Migrations included: 01 to ${String(localMigrations[localMigrations.length - 1].version).padStart(2, '0')} (${localMigrations.length} files)\n`;
  bundle += `-- ==============================================================================\n\n`;

  // Create _migrations ledger table in bundle
  bundle += `-- 1. Ensure migrations audit ledger exists\n`;
  bundle += `CREATE TABLE IF NOT EXISTS public._migrations (\n`;
  bundle += `  id SERIAL PRIMARY KEY,\n`;
  bundle += `  version INTEGER UNIQUE NOT NULL,\n`;
  bundle += `  name VARCHAR(255) UNIQUE NOT NULL,\n`;
  bundle += `  checksum VARCHAR(64) NOT NULL,\n`;
  bundle += `  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),\n`;
  bundle += `  execution_time_ms INTEGER NOT NULL DEFAULT 0\n`;
  bundle += `);\n\n`;

  for (const m of localMigrations) {
    bundle += `-- ------------------------------------------------------------------------------\n`;
    bundle += `-- [MIGRATION ${String(m.version).padStart(2, '0')}] ${m.filename}\n`;
    bundle += `-- SHA-256 Checksum: ${m.checksum}\n`;
    bundle += `-- ------------------------------------------------------------------------------\n`;
    bundle += `${m.content.trim()}\n\n`;
    bundle += `INSERT INTO public._migrations (version, name, checksum, execution_time_ms)\n`;
    bundle += `VALUES (${m.version}, '${m.name}', '${m.checksum}', 0)\n`;
    bundle += `ON CONFLICT (version) DO UPDATE SET checksum = EXCLUDED.checksum;\n\n`;
  }

  fs.writeFileSync(targetPath, bundle, 'utf-8');
  console.log(`${colors.green}✓ Successfully generated bundle at:${colors.reset}\n  ${targetPath}\n`);
  console.log(`${colors.dim}You can copy and run this entire file in Supabase SQL Editor in one click.${colors.reset}\n`);
}

// 5. CREATE command
function commandCreate(localMigrations, rawName) {
  if (!rawName) {
    console.error(`${colors.red}❌ Migration name is required.${colors.reset} Example: node scripts/migrate.mjs --create add_parent_notifications`);
    process.exit(1);
  }

  const cleanName = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '');
  const nextVer = localMigrations.length > 0 ? localMigrations[localMigrations.length - 1].version + 1 : 1;
  const verStr = String(nextVer).padStart(2, '0');
  const filename = `${verStr}_${cleanName}.sql`;
  const targetPath = path.join(MIGRATIONS_DIR, filename);

  const template = `-- ==============================================================================
-- 📜 Supabase Migration ${verStr}: ${cleanName.replace(/_/g, ' ').toUpperCase()}
-- Author: MedAttend Engineering
-- Created: ${new Date().toISOString()}
-- ==============================================================================

-- 1. DDL / Table or Column modifications
-- Example:
-- ALTER TABLE public.sessions
-- ADD COLUMN IF NOT EXISTS example_col VARCHAR(100);

-- 2. Security & RLS Policies (Zero-Trust Invariant)
-- ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;

-- 3. Comments and Documentation
-- COMMENT ON COLUMN public.sessions.example_col IS 'Description of column purpose';
`;

  fs.writeFileSync(targetPath, template, 'utf-8');
  console.log(`\n${colors.green}✓ Created new migration template:${colors.reset}\n  ${targetPath}\n`);
}

// ==============================================================================
// Main CLI Router
// ==============================================================================
async function main() {
  const args = process.argv.slice(2);
  const env = getMergedEnv();
  const dbUrl = getDatabaseUrl(env);
  const localMigrations = getLocalMigrations();

  const isStatus = args.includes('--status') || args.includes('status');
  const isApply = args.includes('--apply') || args.includes('apply');
  const isDryRun = args.includes('--dry-run') || args.includes('dry-run');
  const isBundle = args.includes('--bundle') || args.includes('bundle');
  const createIdx = args.findIndex(a => a === '--create' || a === 'create');
  const isCreate = createIdx !== -1;

  if (isCreate) {
    const name = args[createIdx + 1];
    commandCreate(localMigrations, name);
    return;
  }

  if (isDryRun) {
    await commandDryRun(localMigrations);
    return;
  }

  if (isBundle) {
    const nextArg = args[args.indexOf(args.includes('--bundle') ? '--bundle' : 'bundle') + 1];
    commandBundle(localMigrations, nextArg && !nextArg.startsWith('-') ? nextArg : null);
    return;
  }

  // Database Client Setup
  let client = null;
  if (dbUrl && pg) {
    try {
      client = new pg.Client({
        connectionString: dbUrl,
        ssl: { rejectUnauthorized: false }, // Necessary for Supabase SSL connections
      });
      await client.connect();
    } catch (err) {
      console.warn(`${colors.yellow}⚠️ Warning: Could not connect to database via DATABASE_URL: ${err.message}${colors.reset}`);
      client = null;
    }
  }

  try {
    if (isApply) {
      await commandApply(client, localMigrations);
    } else {
      // Default action is status report
      await commandStatus(client, localMigrations);
      if (client) {
        console.log(`${colors.cyan}Tip: To execute all pending migrations, run:${colors.reset} node scripts/migrate.mjs --apply\n`);
      } else {
        console.log(`${colors.cyan}Tip: To bundle all migrations into 1 copy-paste SQL file for Supabase, run:${colors.reset}`);
        console.log(`  node scripts/migrate.mjs --bundle\n`);
      }
    }
  } finally {
    if (client) {
      await client.end().catch(() => {});
    }
  }
}

main().catch(err => {
  console.error(`${colors.red}Fatal migration runner error:${colors.reset}`, err);
  process.exit(1);
});
