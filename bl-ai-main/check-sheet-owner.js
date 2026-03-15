import { supabaseAdmin } from './config/supabase.js';

async function check() {
  const { data, error } = await supabaseAdmin
    .from('google_sheets_connections')
    .select('user_id, sheet_url, sheet_name, created_at');
  
  if (error) {
    console.log('Error:', error);
  } else {
    console.log('Sheet connections in database:');
    data.forEach(conn => {
      console.log(`- User: ${conn.user_id}`);
      console.log(`  Sheet: ${conn.sheet_name}`);
      console.log(`  URL: ${conn.sheet_url}`);
      console.log(`  Created: ${conn.created_at}\n`);
    });
  }
}

check();
