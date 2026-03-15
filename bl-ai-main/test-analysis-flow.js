import axios from 'axios';
import { supabaseAdmin } from './config/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

async function testFlow() {
  try {
    console.log('1️⃣ Testing login...');
    const loginRes = await axios.post('http://localhost:8000/api/auth/login', {
      email: 'test@marketmind.com',
      password: 'password123'
    });
    const token = loginRes.data.data.token;
    const userId = loginRes.data.data.userId;
    console.log('✅ Login successful');

    console.log('\n2️⃣ Testing sheet status...');
    const statusRes = await axios.get('http://localhost:8000/api/sheets/status', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Sheet status:', statusRes.data.connected ? 'Connected' : 'Not connected');

    console.log('\n3️⃣ Checking sheet analysis results in database...');
    const analysesRes = await axios.get('http://localhost:8000/api/sheets/analysis', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Sheet analysis count:', analysesRes.data.analyses?.length || 0);
    if (analysesRes.data.analyses?.length > 0) {
      console.log('Sample analysis:', JSON.stringify(analysesRes.data.analyses[0], null, 2));
    }

    console.log('\n4️⃣ Checking direct database query...');
    const { data, error } = await supabaseAdmin
      .from('sheet_analysis_results')
      .select('*')
      .eq('user_id', userId)
      .limit(1);
    if (error) {
      console.log('❌ DB Error:', error);
    } else {
      console.log('✅ Direct DB query found:', data.length, 'records');
      if (data.length > 0) {
        console.log('First record:', JSON.stringify(data[0], null, 2));
      }
    }

    console.log('\n✅ Flow test complete!');
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testFlow();
