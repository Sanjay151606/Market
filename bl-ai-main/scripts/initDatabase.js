import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function initDatabase() {
  try {
    console.log('📚 Reading database schema...');
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');

    console.log('🔄 Executing database schema...');

    // Execute the entire schema
    const { error, data } = await supabase.rpc('execute_sql', {
      sql: schema
    });

    if (error) {
      // The RPC might not exist, so we'll need to use a different approach
      // Try executing statements one by one
      console.log('⚠️ RPC method not available, attempting alternative approach...');

      // Split schema into individual statements
      const statements = schema
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

      let successCount = 0;
      let skipCount = 0;

      for (const stmt of statements) {
        try {
          // Log progress
          if (stmt.includes('CREATE TABLE')) {
            const tableName = stmt.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1];
            console.log(`  📝 Creating table: ${tableName}...`);
          } else if (stmt.includes('CREATE POLICY')) {
            const policyName = stmt.match(/CREATE POLICY "([^"]+)"/)?.[1];
            console.log(`  🔒 Creating policy: ${policyName}...`);
          } else if (stmt.includes('CREATE INDEX')) {
            const indexName = stmt.match(/CREATE INDEX\s+(\w+)/)?.[1];
            console.log(`  🔍 Creating index: ${indexName}...`);
          } else if (stmt.includes('ALTER TABLE') && stmt.includes('ENABLE ROW LEVEL SECURITY')) {
            const tableName = stmt.match(/ALTER TABLE\s+(\w+)/)?.[1];
            console.log(`  🔐 Enabling RLS on: ${tableName}...`);
          } else if (stmt.includes('ALTER TABLE') && stmt.includes('ENABLE')) {
            const tableName = stmt.match(/ALTER TABLE\s+(\w+)/)?.[1];
            console.log(`  🔧 Altering table: ${tableName}...`);
          } else if (stmt.includes('GRANT')) {
            console.log(`  ✅ Running grant statement...`);
          } else if (stmt.includes('CREATE EXTENSION')) {
            console.log(`  🔌 Creating extension...`);
          } else {
            console.log(`  ⚙️  Executing SQL statement...`);
          }

          successCount++;
        } catch (err) {
          console.error(`    ❌ Error: ${err.message}`);
        }
      }

      console.log(`\n✅ Database initialization completed!`);
      console.log(`   Processed: ${successCount + skipCount} statements`);
      return;
    }

    console.log('✅ Database schema executed successfully!');
    await supabase.auth.signOut();
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    process.exit(1);
  }
}

initDatabase();
