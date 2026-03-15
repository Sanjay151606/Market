import axios from 'axios';
import { supabase } from '../config/supabase.js';
import dotenv from 'dotenv';
dotenv.config();

async function runTest() {
  try {
    const signupRes = await axios.post('http://localhost:8000/api/auth/register', {
      email: 'test@marketmind.com',
      password: 'password123',
      fullName: 'Test User',
      companyName: 'Test Corp'
    });
    console.log('Signup Res:', signupRes.data.message || 'Success');
  } catch (err) {
    if (err.response?.status !== 400 || !err.response?.data?.error?.includes('User already registered')) {
      console.error('Signup Error:', err.response?.data || err.message);
    } else {
      console.log('User already exists, continuing...');
    }
  }

  try {
    const loginRes = await axios.post('http://localhost:8000/api/auth/login', {
      email: 'test@marketmind.com',
      password: 'password123'
    });
    console.log('Login Res:', loginRes.data.success ? 'Success' : 'Failed');
    const token = loginRes.data.token;
    
    // Simulate real-time test event 
    const testRealtimeRes = await axios.get('http://localhost:8000/api/insights/test-realtime', {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Real-Time Emit:', testRealtimeRes.data.success ? 'Emiitted via User Room' : 'Failed');
  } catch (err) {
    console.error('Login/Test Error:', err.response?.data || err.message);
  }
}
runTest();
