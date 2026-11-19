#!/usr/bin/env node
/**
 * ==============================================================================
 * MedAttend - Archive Past Development & Test Sessions
 * Single Source of Truth: docs/architecture-vault/
 * ==============================================================================
 * Safely marks all pre-launch development & test sessions as archived:
 *   - is_archived = true
 *   - archived_at = NOW()
 *   - target_academic_year = 'Archived'
 * Excludes system configuration rows (__SYSTEM_CONFIG__, __GEOFENCE_CONFIG__).
 * Preserves all attendance records and logs an immutable audit trail entry.
 * ==============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASE_DIR = path.resolve(__dirname, '..');

const req = createRequire(path.join(BASE_DIR, 'frontend', 'package.json'));
const { createClient } = req('@supabase/supabase-js');

// Load environment variables from frontend/.env.local
const envPath = path.join(BASE_DIR, 'frontend', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Error: frontend/.env.local not found.');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim().replace(/^['\"]|['\"]$/g, '');
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Missing Supabase URL or Service Role Key in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function archiveTestSessions() {
  console.log('--- MedAttend: Archiving Pre-Launch Test Sessions ---');
  
  // 1. Fetch unarchived test sessions (excluding system rows)
  const { data: sessions, error: fetchErr } = await supabase
    .from('sessions')
    .select('id, class_name, target_academic_year, created_at')
    .eq('is_archived', false)
    .neq('class_name', '__SYSTEM_CONFIG__')
    .neq('class_name', '__GEOFENCE_CONFIG__')
    .neq('target_academic_year', 'System');

  if (fetchErr) {
    console.error('Failed to fetch unarchived sessions:', fetchErr);
    process.exit(1);
  }

  console.log(`Found ${sessions.length} unarchived test sessions to archive.`);

  if (sessions.length === 0) {
    console.log('No unarchived test sessions found. Baseline is already clean!');
    return;
  }

  const nowIso = new Date().toISOString();
  let updatedCount = 0;

  // Process in batches of 50 using safe UPDATE .in('id', ids)
  const BATCH_SIZE = 50;
  for (let i = 0; i < sessions.length; i += BATCH_SIZE) {
    const chunk = sessions.slice(i, i + BATCH_SIZE);
    const chunkIds = chunk.map(s => s.id);

    const { error: updateErr } = await supabase
      .from('sessions')
      .update({
        is_archived: true,
        archived_at: nowIso,
        target_academic_year: 'Archived',
      })
      .in('id', chunkIds);

    if (updateErr) {
      console.error(`Error updating batch ${i} - ${i + chunk.length}:`, updateErr);
      process.exit(1);
    }

    updatedCount += chunk.length;
    console.log(`Archived ${updatedCount}/${sessions.length} sessions...`);
  }

  // 2. Log immutable audit entry
  try {
    const auditPayload = {
      action: 'ARCHIVE_TEST_SESSIONS',
      actor_id: 'saif',
      actor_email: 'system@medattend.ai',
      actor_role: 'Super Admin',
      target_type: 'SESSION',
      target_id: `BATCH_${updatedCount}`,
      details: {
        reason: 'Pre-launch baseline reset: safely archived historical development & test sessions so real student portal initializes at 0 classes',
        total_archived: updatedCount,
        executed_at: nowIso,
      },
      created_at: nowIso,
    };

    const { error: auditErr } = await supabase.from('audit_logs').insert([auditPayload]);
    if (auditErr) {
      console.warn('Warning: Could not insert audit log entry (non-fatal):', auditErr.message);
    } else {
      console.log('Audit ledger entry logged successfully for compliance.');
    }
  } catch (err) {
    console.warn('Warning inserting audit log:', err);
  }

  console.log(`\n✅ Successfully archived ${updatedCount} test sessions!`);
  console.log('All real student portals will now show 0 total classes and clean status.');
}

archiveTestSessions().catch(err => {
  console.error('Fatal error during archival:', err);
  process.exit(1);
});
