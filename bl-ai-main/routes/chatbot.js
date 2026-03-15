import express from 'express';
import { verifyToken } from '../utils/auth.js';
import { supabaseAdmin } from '../config/supabase.js';
import { getSellerProducts, getInsights, getLogisticsData } from '../utils/db.js';

const router = express.Router();

const buildWebsiteAnalysisContext = async (userId) => {
  const [products, insights, logistics] = await Promise.all([
    getSellerProducts(userId).catch(() => []),
    getInsights(userId).catch(() => []),
    getLogisticsData(userId).catch(() => [])
  ]);

  let sheetAnalyses = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('sheet_analysis_results')
      .select('analysis_type, title, description, recommendations, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (!error && data) sheetAnalyses = data;
  } catch {
    sheetAnalyses = [];
  }

  const totalProducts = products.length;
  const inStock = products.filter((product) => (product.stock_qty || 0) > 0).length;
  const lowStock = products.filter((product) => (product.stock_qty || 0) > 0 && (product.stock_qty || 0) <= 10).length;
  const avgPrice = totalProducts
    ? Number((products.reduce((sum, product) => sum + Number(product.current_price || 0), 0) / totalProducts).toFixed(2))
    : 0;

  const recentInsights = insights.slice(0, 6);
  const highUrgencyCount = recentInsights.filter((insight) => Number(insight.urgency_score || 0) >= 80).length;
  const insightTitles = recentInsights.map((insight) => insight.title).filter(Boolean).slice(0, 4);

  const logisticsRoutes = logistics
    .map((item) => item.route || item.route_name || item.destination || item.source)
    .filter(Boolean)
    .slice(0, 4);

  const latestSheetAnalysis = sheetAnalyses[0]
    ? {
        type: sheetAnalyses[0].analysis_type,
        title: sheetAnalyses[0].title,
        description: sheetAnalyses[0].description,
        recommendations: Array.isArray(sheetAnalyses[0].recommendations)
          ? sheetAnalyses[0].recommendations.slice(0, 2)
          : []
      }
    : null;

  return {
    products: {
      total: totalProducts,
      inStock,
      lowStock,
      avgPrice,
      sampleProducts: products.slice(0, 5).map((product) => ({
        name: product.title,
        category: product.category,
        price: product.current_price,
        stock: product.stock_qty
      }))
    },
    insights: {
      total: insights.length,
      highUrgencyCount,
      recentTitles: insightTitles
    },
    logistics: {
      totalLogs: logistics.length,
      recentRoutes: logisticsRoutes
    },
    sheetAnalysis: {
      count: sheetAnalyses.length,
      latest: latestSheetAnalysis
    }
  };
};

// Send message to chatbot
router.post('/message', verifyToken, async (req, res) => {
  try {
    const { message, conversationHistory = [], pageContext = {} } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }

    const groqApiKey = process.env.GROQ_API_KEY;
    if (!groqApiKey || groqApiKey === 'your_groq_api_key') {
      return res.status(500).json({ 
        success: false, 
        error: 'AI service not configured. Please set GROQ_API_KEY in environment variables.',
        response: 'I\'m currently unavailable due to missing API configuration.' 
      });
    }

    const { default: Groq } = await import('groq-sdk');
    const groq = new Groq({ apiKey: groqApiKey });

    const analysisContext = await buildWebsiteAnalysisContext(req.user.userId);

    // System prompt for website assistant
    const systemPrompt = `You are a helpful AI assistant for MarketMind AI, a business intelligence platform for e-commerce sellers.

  Rules:
  - Keep responses short: 1-3 sentences max.
  - Give correct, direct answers based on MarketMind features and the provided user data context.
  - If unsure, say "I’m not sure" and suggest the closest relevant page.
  - Do not invent features, numbers, or guarantees.
  - Use simple language.
  - When data is available, mention relevant current metrics briefly.
  - If data is missing, clearly say what data is not available and what user can sync/configure.

  MarketMind AI helps sellers with:
  - Price tracking
  - Competitor radar
  - Logistics intelligence
  - Review intelligence
  - Insights feed
  - Notifications and profile settings`;

    const contextPrompt = `CURRENT USER CONTEXT:
${JSON.stringify({
  currentPage: pageContext.currentPage || 'unknown',
  pageTitle: pageContext.pageTitle || 'unknown',
  analysisData: analysisContext
}, null, 2)}`;

    // Build messages array with conversation history
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: `${contextPrompt}\n\nUser question: ${message}` }
    ];

    // Call Groq API
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      model: 'llama-3.1-8b-instant',
      temperature: 0.2,
      max_tokens: 220,
      top_p: 1
    });

    const aiResponse = completion.choices[0]?.message?.content || 'I\'m having trouble responding right now.';

    res.json({ 
      success: true, 
      response: aiResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to process chat message',
      response: 'Sorry, I encountered an error while processing your message. Please try again.'
    });
  }
});

export default router;
