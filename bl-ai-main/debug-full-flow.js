import axios from 'axios';
import { supabaseAdmin } from './config/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

async function debugFlow() {
  try {
    // 1. Login
    console.log('🔐 Step 1: Login...');
    const loginRes = await axios.post('http://localhost:8000/api/auth/login', {
      email: 'test@marketmind.com',
      password: 'password123'
    });
    const token = loginRes.data.data.token;
    const userId = loginRes.data.data.userId;
    console.log('✅ Logged in as:', userId);

    // 2. Check sheet connection
    console.log('\n📋 Step 2: Check sheet connection...');
    const statusRes = await axios.get('http://localhost:8000/api/sheets/status', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Sheet connected:', statusRes.data.connected);
    if (statusRes.data.connection) {
      console.log('Sheet URL:', statusRes.data.connection.sheet_url);
      console.log('Sheet ID:', statusRes.data.connection.sheet_id);
      console.log('Last sync:', statusRes.data.connection.last_sync);
    }

    // 3. Manually trigger analysis
    console.log('\n🔍 Step 3: Trigger analysis...');
    const analyzeRes = await axios.post('http://localhost:8000/api/sheets/analyze', {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Analysis response:', JSON.stringify(analyzeRes.data, null, 2));

    // 4. Check database for saved results
    console.log('\n💾 Step 4: Check database for analysis results...');
    const { data: dbResults, error: dbError } = await supabaseAdmin
      .from('sheet_analysis_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (dbError) {
      console.log('❌ DB Error:', dbError);
    } else {
      console.log('✅ Found', dbResults.length, 'analysis results in database');
      if (dbResults.length > 0) {
        console.log('First result:', JSON.stringify(dbResults[0], null, 2));
      }
    }

    // 5. Check API endpoint
    console.log('\n📡 Step 5: Check /api/sheets/analysis endpoint...');
    const apiRes = await axios.get('http://localhost:8000/api/sheets/analysis', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('API analysis count:', apiRes.data.analyses?.length || 0);
    if (apiRes.data.analyses?.length > 0) {
      console.log('First API result:', JSON.stringify(apiRes.data.analyses[0], null, 2));
    }

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

debugFlow();
