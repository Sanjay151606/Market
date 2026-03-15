import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { verifyToken } from '../utils/auth.js';
import { getInsights, createInsight, submitInsightFeedback, getSellerProducts } from '../utils/db.js';
import { generateInsightsFromGroq } from '../utils/groqClient.js';

const router = express.Router();

// Test REALTIME ENDPOINT (For debugging only)
router.get('/test-realtime', verifyToken, (req, res) => {
  const io = req.app.locals.io;
  if (io) {
    const testInsight = {
      id: Date.now(),
      title: 'Automated Real-Time Test',
      explanation: 'Checking if WebSockets are connected and pushing updates to the UI.',
      action: 'Check Dashboard',
      urgency: 90,
      confidence: 95,
      category: 'pricing',
      created_at: new Date().toISOString()
    };

    // Broadcast to the specific user's room
    io.to(`seller-${req.user.userId}`).emit('new-insight', testInsight);
    io.to(`seller-${req.user.userId}`).emit('new-alert', {
      id: Date.now() + 1,
      title: 'Test Alert Event',
      message: 'This alert was spawned via the test endpoint via Socket.io',
      severity: 'high',
      created_at: new Date().toISOString()
    });

    res.json({ success: true, message: 'Real-time test events emitted!', insight: testInsight });
  } else {
    res.status(500).json({ success: false, message: 'Socket.io not initialized on app.locals' });
  }
});

// Get insights with filters
router.get('/', verifyToken, async (req, res) => {
  try {
    const { type, urgency, productId } = req.query;

    const filters = {};
    if (type) filters.type = type;
    if (urgency) filters.urgency_min = parseInt(urgency);
    if (productId) filters.product_id = productId;

    const insights = await getInsights(req.user.userId, filters);

    res.json({ success: true, data: insights });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single insight
router.get('/:insightId', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('insights')
      .select('*')
      .eq('id', req.params.insightId)
      .eq('seller_id', req.user.userId)
      .single();

    if (error) throw error;

    res.json({ success: true, data });
  } catch (error) {
    res.status(404).json({ success: false, error: 'Insight not found' });
  }
});

// Create insight (for agent to call)
router.post('/', verifyToken, async (req, res) => {
  try {
    const {
      productId,
      type,
      title,
      explanation,
      action,
      urgencyScore,
      confidence,
      supportingData
    } = req.body;

    const insightData = {
      seller_id: req.user.userId,
      product_id: productId,
      type, // 'pricing', 'product_improvement', 'logistics_optimization'
      title,
      explanation,
      action,
      urgency_score: urgencyScore,
      confidence: confidence,
      supporting_data: supportingData,
      created_at: new Date().toISOString()
    };

    const insight = await createInsight(insightData);

    // Emit real-time update
    const io = req.app.locals.io;
    io.to(`seller-${req.user.userId}`).emit('new-insight', insight);

    res.status(201).json({
      success: true,
      message: 'Insight created successfully',
      data: insight
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit feedback on insight
router.post('/:insightId/feedback', verifyToken, async (req, res) => {
  try {
    const { feedback } = req.body; // 'helpful', 'not_helpful', 'applied', 'ignored'

    const result = await submitInsightFeedback(req.params.insightId, feedback);

    res.json({
      success: true,
      message: 'Feedback recorded',
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Generate AI insights (ready for AI integration)
router.post('/generate/batch', verifyToken, async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Product IDs required'
      });
    }

    // Fetch the chosen products to give the LLM context
    const allProducts = await getSellerProducts(req.user.userId);
    const selectedProducts = allProducts.filter(p => productIds.includes(p.id))
      .map(p => ({
        name: p.title,
        price: p.current_price,
        inventory: p.stock_qty,
        category: p.category
      }));

    // Call Groq AI to generate structured insights
    const aiInsights = await generateInsightsFromGroq(selectedProducts, 'general business');

    const savedInsights = [];

    // Save generated AI insights to the database
    for (const insight of aiInsights) {
      const insightData = {
        seller_id: req.user.userId,
        product_id: allProducts.find(p => p.title === selectedProducts.find(sp => sp.name)?.name)?.id || null,
        type: insight.type || 'pricing',
        title: insight.title || 'New AI Insight',
        explanation: insight.description || 'Generated market insight from AI analysis.',
        action: 'Review and apply this recommendation in your pricing/logistics strategy.',
        urgency_score: insight.urgency_level === 'high' ? 90 : insight.urgency_level === 'medium' ? 60 : 30,
        confidence: insight.urgency_level === 'high' ? 0.9 : 0.75,
        supporting_data: { source: 'groq', generated_at: new Date().toISOString() },
        created_at: new Date().toISOString()
      };

      const saved = await createInsight(insightData);
      savedInsights.push(saved);

      // Emit to the frontend UI
      const io = req.app.locals.io;
      io.to(`seller-${req.user.userId}`).emit('new-insight', saved);
    }

    res.json({
      success: true,
      message: 'AI insights generated successfully via Groq.',
      data: savedInsights
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;