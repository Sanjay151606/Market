import express from 'express';
import { supabase, supabaseAdmin } from '../config/supabase.js';
import GoogleSheetsService from '../utils/googleSheetsService.js';
import AnalysisEngine from '../utils/analysisEngine.js';
import { verifyToken } from '../utils/auth.js';

const router = express.Router();

/**
 * Get Google OAuth URL
 */
router.get('/auth-url', (req, res) => {
  try {
    const authUrl = GoogleSheetsService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Handle OAuth callback and save tokens
 */
router.post('/auth-callback', verifyToken, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.userId;

    // Exchange code for tokens
    const tokens = await GoogleSheetsService.getTokensFromCode(code);

    res.json({
      success: true,
      message: 'Google authenticated. Please provide your sheet link to configure.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Link and configure Google Sheet for user
 * POST /api/sheets/configure
 * Body: { sheetUrl, accessToken }
 */
router.post('/configure', verifyToken, async (req, res) => {
  try {
    const { sheetUrl, accessToken } = req.body;
    const userId = req.user.userId;

    console.log(`[Sheets] Configuring sheet for user ${userId}`);

    if (!sheetUrl) {
      return res.status(400).json({
        error: 'Sheet URL is required'
      });
    }

    // Use the API Key from environment variables if no redirect token is available
    const activeToken = process.env.GOOGLE_API_KEY || accessToken || 'demo_mode';

    // Extract sheet ID from URL
    const sheetId = GoogleSheetsService.extractSheetId(sheetUrl);
    if (!sheetId) {
      return res.status(400).json({
        error: 'Invalid Google Sheets URL format'
      });
    }

    // Initialize Google Sheets service
    const sheetsService = new GoogleSheetsService(activeToken);
    let sheetName = 'My Business Sheet';
    let setupResult = { columns: [] };

    // If we have a real-looking token or a configured service account, try to use Google API
    const isServiceAccount = !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_KEY);

    if ((activeToken && activeToken !== 'demo_mode') || isServiceAccount) {
      try {
        console.log(`[Sheets] Attempting metadata fetch for ${sheetId} using ${isServiceAccount ? 'Service Account' : 'OAuth'}`);
        const metadata = await sheetsService.getSheetMetadata(sheetId);
        sheetName = metadata.properties.title;
        console.log(`[Sheets] Found spreadsheet: ${sheetName}`);

        setupResult = await sheetsService.setupSheetColumns(sheetId, 'Business Data');
        await sheetsService.createAnalysisSheet(sheetId);
      } catch (googleError) {
        console.error('[Sheets] Google API Detailed Error:', JSON.stringify(googleError, null, 2));

        // Detailed error messages for Service Account/Permission issues
        if (googleError.message.includes('auth') || googleError.message.includes('credential') || googleError.status === 401) {
          return res.status(401).json({
            error: 'Service Account Not Configured: Please ensure GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_KEY are set in .env.'
          });
        }

        if (googleError.message.includes('permission') || googleError.status === 403) {
          const botEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'your service account email';
          return res.status(403).json({
            error: `Access Denied: Please SHARE your Google Sheet with the Service Account email: ${botEmail} and give it "Editor" permissions.`
          });
        }

        throw googleError;
      }
    }

    // Check if user already has a connection
    const { data: existingConnection } = await supabaseAdmin
      .from('google_sheets_connections')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    // Check if user exists in the local 'users' table or create a placeholder
    const { data: userRecord, error: userError } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!userRecord) {
      console.log(`[Sheets] User ${userId} not found in users table. Syncing profile...`);
      await supabaseAdmin.from('users').insert([{
        id: userId,
        email: req.user.email || 'user@example.com',
        full_name: 'MarketMind User'
      }]);
    }

    // Save connection to database
    const connectionData = {
      user_id: userId,
      sheet_id: sheetId,
      sheet_url: sheetUrl,
      sheet_name: sheetName,
      auth_token: activeToken,
      created_columns: true,
      status: 'connected',
      last_sync: new Date().toISOString()
    };

    let savedConnection;
    // We wrap db calls in try-catch to identify schema issues
    try {
      if (existingConnection) {
        const { data, error } = await supabaseAdmin
          .from('google_sheets_connections')
          .update(connectionData)
          .eq('user_id', userId)
          .select()
          .single();
        if (error) throw error;
        savedConnection = data;
      } else {
        const { data, error } = await supabaseAdmin
          .from('google_sheets_connections')
          .insert([connectionData])
          .select()
          .single();
        if (error) throw error;
        savedConnection = data;
      }
    } catch (dbError) {
      console.error('[Sheets] Database Error:', dbError.message);
      // Return a descriptive error if the table doesn't exist
      if (dbError.message.includes('relation') || dbError.message.includes('cache')) {
        return res.status(500).json({
          error: 'Database schema not initialized. Please run the SQL in DATABASE_SETUP.md'
        });
      }
      throw dbError;
    }

    // Trigger initial analysis
    if (savedConnection) {
      await triggerSheetAnalysis(userId, savedConnection.id, sheetId, activeToken);
    }

    res.json({
      success: true,
      connection: savedConnection,
      message: 'Google Sheet linked! System is ready for data analysis.',
      setupDetails: {
        analysisSheetCreated: true,
        businessDataSheet: 'Business Data'
      }
    });
  } catch (error) {
    console.error('[Sheets] Configuration failed:', error);
    res.status(500).json({
      error: error.message || 'Configuration failed. Please check backend logs for details.'
    });
  }
});

/**
 * Get user's sheet connection status
 * GET /api/sheets/status
 */
router.get('/status', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const { data, error } = await supabaseAdmin
      .from('google_sheets_connections')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      connected: !!data,
      connection: data || null,
      message: data ? 'Sheet configured and connected' : 'No sheet configured yet'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Fetch latest analysis results for user
 * GET /api/sheets/analysis
 */
router.get('/analysis', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    const { data, error } = await supabaseAdmin
      .from('sheet_analysis_results')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.json({
      analyses: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manually trigger analysis on demand
 * POST /api/sheets/analyze
 */
router.post('/analyze', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user's sheet connection
    const { data: connection, error } = await supabaseAdmin
      .from('google_sheets_connections')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !connection) {
      return res.status(404).json({
        error: 'No Google Sheet configured. Please configure one first.'
      });
    }

    // Trigger analysis
    const analyses = await triggerSheetAnalysis(
      userId,
      connection.id,
      connection.sheet_id,
      connection.auth_token
    );

    res.json({
      success: true,
      analyses,
      message: 'Analysis completed successfully'
    });
  } catch (error) {
    console.error('Error triggering analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Disconnect Google Sheet
 * DELETE /api/sheets/disconnect
 */
router.delete('/disconnect', verifyToken, async (req, res) => {
  try {
    const userId = req.user.userId;

    await supabaseAdmin
      .from('google_sheets_connections')
      .delete()
      .eq('user_id', userId);

    res.json({
      success: true,
      message: 'Google Sheet disconnected successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper function to trigger sheet analysis
 */
async function triggerSheetAnalysis(userId, connectionId, sheetId, accessToken) {
  try {
    // Real mode: read actual data from Google Sheets
    const sheetsService = new GoogleSheetsService(accessToken);
    const sheetData = await sheetsService.readSheetData(sheetId, 'Business Data!A:P');

    if (sheetData.length <= 1) {
      // Only headers, no data yet
      return {
        message: 'Sheet is empty. Start entering business data in "Business Data" sheet to get analysis.',
        analyses: []
      };
    }

    // Run analysis using the extracted sheet data
    const analysisResult = await AnalysisEngine.analyzeBusinessData(
      userId,
      connectionId,
      sheetData
    );

    // Write results back to the sheet
    for (const analysis of analysisResult.analyses) {
      await sheetsService.writeAnalysisResults(sheetId, {
        title: analysis.title,
        findings: JSON.stringify(analysis.insights),
        recommendation: analysis.recommendations[0] || '',
        actionItems: analysis.recommendations,
        confidence: analysis.confidence
      });
    }

    // Update last sync time
    await supabaseAdmin
      .from('google_sheets_connections')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', connectionId);

    return analysisResult.analyses;
  } catch (error) {
    console.error('Error in triggerSheetAnalysis:', error);
    throw error;
  }
}

export default router;
