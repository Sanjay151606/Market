import { supabase } from './config/supabase.js';
async function test() {
  try {
    const { data, error } = await supabase.from('products').select('*').limit(1);
    console.log(data, error);
  } catch (err) {
    console.error('Crash:', err);
  }
}
test();
