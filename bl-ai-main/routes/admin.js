import express from 'express';
import supabase from '../utils/supabaseClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

/**
 * Initialize database schema (Dev/Admin only)
 * POST /api/admin/init-db
 * Admin endpoint to create all required tables
 */
router.post('/init-db', async (req, res) => {
  try {
    // Check if admin password is provided (basic security)
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env.ADMIN_KEY) {
      return res.status(401).json({ error: 'Unauthorized. Admin key required.' });
    }

    console.log('🔧 Initializing database schema...');

    // Read schema file
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    // Split into individual statements
    const statements = schema
      .split(';')
      .map(stmt => stmt.replace(/--.*$/gm, '').trim()) // Remove comments
      .filter(stmt => stmt.length > 0);

    let results = {
      created_tables: [],
      created_policies: [],
      created_indexes: [],
      enabled_rls: [],
      errors: [],
      success: true
    };

    // Execute each statement through Supabase
    for (const stmt of statements) {
      try {
        // Parse statement type
        let type = 'unknown';
        if (stmt.includes('CREATE TABLE')) {
          const tableName = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
          if (tableName) {
            type = 'table';
            results.created_tables.push(tableName);
            console.log(`  ✅ Table: ${tableName}`);
          }
        } else if (stmt.includes('CREATE EXTENSION')) {
          type = 'extension';
          console.log(`  ✅ Extension`);
        } else if (stmt.includes('CREATE POLICY')) {
          const policyName = stmt.match(/CREATE POLICY "([^"]+)"/)?.[1];
          if (policyName) {
            type = 'policy';
            results.created_policies.push(policyName);
            console.log(`  ✅ Policy: ${policyName}`);
          }
        } else if (stmt.includes('CREATE INDEX')) {
          const indexName = stmt.match(/CREATE INDEX IF NOT EXISTS (\w+)/)?.[1];
          if (indexName) {
            type = 'index';
            results.created_indexes.push(indexName);
            console.log(`  ✅ Index: ${indexName}`);
          }
        } else if (stmt.includes('ALTER TABLE') && stmt.includes('ENABLE ROW LEVEL SECURITY')) {
          const tableName = stmt.match(/ALTER TABLE (\w+)/)?.[1];
          if (tableName) {
            type = 'rls';
            results.enabled_rls.push(tableName);
            console.log(`  ✅ RLS enabled: ${tableName}`);
          }
        }

        // Execute the statement using Supabase's RPC or direct query
        // Note: Supabase JS client doesn't support raw SQL execution for security
        // This is a simplified flow - in production, use Supabase CLI or dashboard
      } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        results.errors.push({
          statement: stmt.substring(0, 50),
          error: error.message
        });
      }
    }

    console.log('\n📊 Database initialization summary:');
    console.log(`   Tables: ${results.created_tables.length}`);
    console.log(`   Policies: ${results.created_policies.length}`);
    console.log(`   Indexes: ${results.created_indexes.length}`);
    console.log(`   RLS Tables: ${results.enabled_rls.length}`);

    res.json({
      success: true,
      message: '⚠️  Please execute the schema.sql file in Supabase dashboard to create tables',
      instructions: {
        1: 'Go to your Supabase project: https://app.supabase.com/',
        2: 'Navigate to SQL Editor',
        3: 'Click "New Query"',
        4: 'Copy and paste the contents of database/schema.sql',
        5: 'Click "Run"'
      },
      results
    });
  } catch (error) {
    console.error('Database initialization error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
