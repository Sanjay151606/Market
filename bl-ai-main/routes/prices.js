import express from 'express';
import { supabase } from '../config/supabase.js';
import { verifyToken } from '../utils/auth.js';
import { getPriceHistory, logPrice } from '../utils/db.js';

const router = express.Router();

// Get price history for a product
router.get('/:productId', verifyToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const priceHistory = await getPriceHistory(req.params.productId, parseInt(days));

    res.json({ success: true, data: priceHistory });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get price comparison
router.get('/:productId/comparison', verifyToken, async (req, res) => {
  try {
    const { days = 7 } = req.query;

    // Generate intelligent structured mock data that fits the UI perfectly
    // In a real scenario, this aggregates from 'price_logs' and 'competitors' tables.
    const priceHistory = [
      { date: 'Mon', yours: 1200, comp1: 1150, comp2: 1250 },
      { date: 'Tue', yours: 1200, comp1: 1150, comp2: 1240 },
      { date: 'Wed', yours: 1180, comp1: 1100, comp2: 1240 },
      { date: 'Thu', yours: 1180, comp1: 1100, comp2: 1220 },
      { date: 'Fri', yours: 1150, comp1: 1100, comp2: 1200 },
      { date: 'Sat', yours: 1150, comp1: 1080, comp2: 1190 },
      { date: 'Sun', yours: 1120, comp1: 1080, comp2: 1190 }
    ];

    const volatility = [
      { competitor: 'Competitor A', trend: 'down', volatility: 8.5 },
      { competitor: 'Competitor B', trend: 'down', volatility: 4.2 }
    ];

    const recommendations = [
      {
        id: 1,
        title: 'Price Match Opportunity',
        description: 'Competitor A has consistently lowered their price over the last 3 days. Recommend a temporary 5% discount to maintain buy-box share.',
        impact: 'high',
        confidence: 92
      },
      {
        id: 2,
        title: 'Margin Optimization',
        description: 'Competitor B is priced 6% higher than you. You have room to increase prices by 2% without losing your competitive edge.',
        impact: 'medium',
        confidence: 85
      }
    ];

    res.json({
      success: true,
      data: {
        priceHistory,
        volatility,
        recommendations
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Log new price (called by scraper/agent)
router.post('/:productId/log', verifyToken, async (req, res) => {
  try {
    const { price, source = 'self', platform = 'unknown' } = req.body;

    if (!price) {
      return res.status(400).json({ success: false, error: 'Price is required' });
    }

    const priceLog = {
      product_id: req.params.productId,
      seller_id: req.user.userId,
      price,
      source,
      platform,
      timestamp: new Date().toISOString()
    };

    const result = await logPrice(priceLog);

    // Emit real-time update
    const io = req.app.locals.io;
    io.to(`seller-${req.user.userId}`).emit('price-updated', {
      productId: req.params.productId,
      price
    });

    res.json({
      success: true,
      message: 'Price logged successfully',
      data: result
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get price analytics
router.get('/:productId/analytics', verifyToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - parseInt(days));

    const { data: prices, error } = await supabase
      .from('price_logs')
      .select('price')
      .eq('product_id', req.params.productId)
      .eq('source', 'self')
      .gte('timestamp', dateFrom.toISOString());

    if (error) throw error;

    const priceArray = prices.map(p => p.price);
    const min = Math.min(...priceArray);
    const max = Math.max(...priceArray);
    const avg = priceArray.reduce((a, b) => a + b, 0) / priceArray.length;
    const latest = priceArray[priceArray.length - 1];

    const volatility = Math.sqrt(
      priceArray.reduce((sum, price) => sum + Math.pow(price - avg, 2), 0) / priceArray.length
    );

    res.json({
      success: true,
      data: {
        min,
        max,
        average: avg,
        latest,
        volatility: parseFloat(volatility.toFixed(2)),
        dataPoints: priceArray.length
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;