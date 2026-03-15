import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase configuration. Check your .env file.');
}

// Client for user-facing operations
export const supabase = createClient(supabaseUrl, supabaseKey);

// Admin client for server-side operations
export const supabaseAdmin = createClient(supabaseUrl, serviceKey || supabaseKey);