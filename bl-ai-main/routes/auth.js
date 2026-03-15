import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import { generateToken, verifyToken } from '../utils/auth.js';
import { createUser, getUserById } from '../utils/db.js';

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName, companyName } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    console.log('📝 Registering user:', email);

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });

    if (authError) {
      console.error('❌ Auth creation failed:', authError.message);
      return res.status(400).json({ success: false, error: authError.message });
    }

    console.log('✅ Auth user created:', authData.user.id);

    // Create user profile in database
    const userData = {
      id: authData.user.id,
      email,
      full_name: fullName,
      company_name: companyName || 'Default Company',
      created_at: new Date().toISOString()
    };

    const { error: dbError } = await supabase
      .from('users')
      .insert([userData]);

    if (dbError) {
      console.error('❌ User profile creation failed:', dbError.message);
      // Delete the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return res.status(400).json({ success: false, error: 'Failed to create user profile' });
    }

    console.log('✅ User profile created successfully');

    const token = generateToken(authData.user.id, email);

    res.json({
      success: true,
      message: 'Registration successful',
      data: { userId: authData.user.id, email, fullName, companyName, token }
    });
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password required' });
    }

    console.log('🔐 Login attempt:', email);

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('❌ Login failed:', error.message);
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    console.log('✅ Login successful');

    const token = generateToken(data.user.id, email);

    // Fetch user profile (or create if missing to avoid foreign key errors)
    let { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    if (!userData && !userError) {
      console.log('🔄 Syncing user profile for existing auth account:', email);
      const { data: newProfile } = await supabase
        .from('users')
        .insert([{
          id: data.user.id,
          email: email,
          full_name: data.user.user_metadata?.full_name || 'MarketMind User'
        }])
        .select()
        .single();
      userData = newProfile;
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        userId: data.user.id,
        email,
        token,
        user: userData
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await getUserById(req.user.userId);
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { fullName, companyName } = req.body;

    const { data, error } = await supabase
      .from('users')
      .update({ full_name: fullName, company_name: companyName })
      .eq('id', req.user.userId)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Profile updated',
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Logout (client-side token invalidation)
router.post('/logout', verifyToken, (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;