import { supabaseAdmin } from './config/supabase.js';
import GoogleSheetsService from './utils/googleSheetsService.js';
import AnalysisEngine from './utils/analysisEngine.js';
import dotenv from 'dotenv';
dotenv.config();

async function runAnalysis() {
  try {
    // Get the sheet connection
    const { data: connections, error: connError } = await supabaseAdmin
      .from('google_sheets_connections')
      .select('*')
      .single();

    if (connError || !connections) {
      console.log('❌ No sheet connection found');
      return;
    }

    console.log('✅ Found sheet connection for user:', connections.user_id);
    console.log('   Sheet Name:', connections.sheet_name);

    // Read data from Google Sheet
    console.log('\n📖 Reading data from Google Sheet...');
    const sheetsService = new GoogleSheetsService(connections.auth_token);
    const sheetData = await sheetsService.readSheetData(connections.sheet_id, 'Business Data!A:P');

    console.log(`✅ Read ${sheetData.length} rows from sheet (${sheetData.length - 1} data rows)`);
    
    if (sheetData.length <= 1) {
      console.log('⚠️  Sheet has only headers, no data');
      return;
    }

    // Run analysis
    console.log('\n🔍 Running analysis engine...');
    const analysisResult = await AnalysisEngine.analyzeBusinessData(
      connections.user_id,
      connections.id,
      sheetData
    );

    console.log(`✅ Analysis complete! Generated ${analysisResult.analyses?.length || 0} insights`);
    
    analysisResult.analyses?.forEach((analysis, idx) => {
      console.log(`\n${idx + 1}. ${analysis.title}`);
      console.log(`   Type: ${analysis.type}`);
      console.log(`   Confidence: ${analysis.confidence * 100}%`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

runAnalysis();
