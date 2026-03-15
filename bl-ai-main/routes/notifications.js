import express from 'express';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../utils/auth.js';
import {
  getNotificationPreferences,
  updateNotificationPreferences
} from '../utils/db.js';

const router = express.Router();

// Get notification preferences
router.get('/preferences', verifyToken, async (req, res) => {
  try {
    const prefs = await getNotificationPreferences(req.user.userId);
    
    // Return defaults if not found
    const defaults = {
      email: true,
      whatsapp: false,
      push: true,
      urgency_threshold: 5,
      digest_frequency: 'daily' // 'instant', 'daily', 'weekly'
    };

    res.json({
      success: true,
      data: prefs || defaults
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update notification preferences
router.put('/preferences', verifyToken, async (req, res) => {
  try {
    const { email, whatsapp, push, urgencyThreshold, digestFrequency } = req.body;

    const preferences = {
      email: email !== undefined ? email : true,
      whatsapp: whatsapp !== undefined ? whatsapp : false,
      push: push !== undefined ? push : true,
      urgency_threshold: urgencyThreshold || 5,
      digest_frequency: digestFrequency || 'daily'
    };

    const updated = await updateNotificationPreferences(
      req.user.userId,
      preferences
    );

    res.json({
      success: true,
      message: 'Preferences updated',
      data: updated
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get unread alerts
router.get('/alerts', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('user_id', req.user.userId)
      .eq('read', false)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data,
      unreadCount: data?.length || 0
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark alert as read
router.put('/alerts/:alertId/read', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('id', req.params.alertId)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Alert marked as read',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark all alerts as read
router.put('/alerts/mark-all-read', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .update({ read: true, read_at: new Date().toISOString() })
      .eq('user_id', req.user.userId)
      .eq('read', false)
      .select();

    if (error) throw error;

    res.json({
      success: true,
      message: `Marked ${data?.length || 0} alerts as read`,
      data
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create alert (for internal use)
router.post('/create', verifyToken, async (req, res) => {
  try {
    const {
      type,
      title,
      message,
      insightId,
      urgency,
      actionUrl
    } = req.body;

    const { data, error } = await supabase
      .from('alerts')
      .insert([{
        user_id: req.user.userId,
        type, // 'insight', 'price_alert', 'competitor_alert', 'review_alert'
        title,
        message,
        insight_id: insightId,
        urgency: urgency || 'medium',
        action_url: actionUrl,
        read: false,
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) throw error;

    // Emit real-time notification
    const io = req.app.locals.io;
    io.to(`seller-${req.user.userId}`).emit('new-alert', data[0]);

    res.status(201).json({
      success: true,
      message: 'Alert created',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete alert
router.delete('/alerts/:alertId', verifyToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('alerts')
      .delete()
      .eq('id', req.params.alertId);

    if (error) throw error;

    res.json({ success: true, message: 'Alert deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;