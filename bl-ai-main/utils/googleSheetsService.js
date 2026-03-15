import { google } from 'googleapis';
import supabase from './supabaseClient.js';

// Initialize Google Sheets API
const sheets = google.sheets('v4');
const drive = google.drive('v3');

export class GoogleSheetsService {
  constructor(accessToken) {
    this.accessToken = accessToken;
    
    // Check if we use Service Account or OAuth/API Key
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      console.log(`[SheetsService] Initializing JWT with ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
      // Use Service Account (The Pro Way)
      // Robust handling of private keys from various .env formats
      let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      
      // Remove wrapping quotes if they exist
      if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
        privateKey = privateKey.slice(1, -1);
      }
      
      // Replace literal \n with actual newlines
      privateKey = privateKey.replace(/\\n/g, '\n');

      this.auth = new google.auth.JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: privateKey,
        scopes: ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive.readonly']
      });
    } else if (accessToken && accessToken !== 'api_key_mode' && accessToken !== 'demo_mode') {
      console.log('[SheetsService] Initializing OAuth2');
      // Use User OAuth
      this.auth = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      this.auth.setCredentials({ access_token: accessToken });
    } else if (process.env.GOOGLE_API_KEY) {
      console.log('[SheetsService] Initializing with API Key');
      // Use Simple API Key (READ-ONLY)
      this.auth = process.env.GOOGLE_API_KEY; 
    } else {
      console.log('[SheetsService] No authentication method found');
      // Fallback for demo/unconfigured
      this.auth = null;
    }
  }

  /**
   * Extract sheet ID from Google Sheets URL
   */
  static extractSheetId(sheetUrl) {
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  /**
   * Get sheet metadata
   */
  async getSheetMetadata(spreadsheetId) {
    try {
      if (!this.auth) throw new Error('No Google authentication configured.');

      const response = await sheets.spreadsheets.get({
        auth: this.auth,
        spreadsheetId,
      });
      return response.data;
    } catch (error) {
      console.error('Error getting sheet metadata:', error);
      // Helpful info for debugging unregistered callers
      if (error.status === 403 && typeof this.auth !== 'string') {
         console.log('[DEBUG] Auth object type:', this.auth.constructor.name);
      }
      throw error;
    }
  }

  /**
   * Create columns in the sheet for business data entry
   */
  async setupSheetColumns(spreadsheetId, sheetName) {
    try {
      if (!this.auth || typeof this.auth === 'string') {
        throw new Error('WRITE access requires Service Account or OAuth. API Key is Read-Only.');
      }
      // Define column headers
      const headers = [
        'Date',
        'Product Name',
        'SKU',
        'Units Sold',
        'Sale Price',
        'Total Revenue',
        'Customer Count',
        'Customer Reviews',
        'Average Rating',
        'Competitor Price',
        'Inventory Level',
        'Reorder Status',
        'Stock Qty',
        'Purchase Price',
        'Selling Price',
        'Last Restock'
      ];

      // Get existing sheets
      const metadata = await this.getSheetMetadata(spreadsheetId);
      let targetSheet = metadata.sheets.find(s => s.properties.title === sheetName);

      // If sheet doesn't exist, create it
      if (!targetSheet) {
        const createResponse = await sheets.spreadsheets.batchUpdate({
          auth: this.auth,
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sheetName,
                  }
                }
              }
            ]
          }
        });
        targetSheet = createResponse.data.replies[0].addSheet.properties;
      }

      // Add headers to the first row
      await sheets.spreadsheets.values.update({
        auth: this.auth,
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [headers]
        }
      });

      // Format header row (bold, background color)
      await sheets.spreadsheets.batchUpdate({
        auth: this.auth,
        spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId: targetSheet.sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.2, green: 0.2, blue: 0.2 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            }
          ]
        }
      });

      // Add data validation and formatting
      await sheets.spreadsheets.batchUpdate({
        auth: this.auth,
        spreadsheetId,
        requestBody: {
          requests: [
            {
              autoResizeDimensions: {
                dimensions: {
                  sheetId: targetSheet.sheetId,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: headers.length
                }
              }
            }
          ]
        }
      });

      return {
        sheetId: targetSheet.sheetId,
        sheetName,
        columns: headers,
        success: true
      };
    } catch (error) {
      console.error('Error setting up sheet columns:', error);
      throw error;
    }
  }

  /**
   * Create an additional "Analysis" sheet for results
   */
  async createAnalysisSheet(spreadsheetId) {
    try {
      if (!this.auth || typeof this.auth === 'string') {
        throw new Error('WRITE access requires Service Account or OAuth. API Key is Read-Only.');
      }
      const metadata = await this.getSheetMetadata(spreadsheetId);
      const analysisSheetExists = metadata.sheets.some(s => s.properties.title === 'Analysis Results');

      if (analysisSheetExists) {
        return { sheetName: 'Analysis Results', created: false };
      }

      const createResponse = await sheets.spreadsheets.batchUpdate({
        auth: this.auth,
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: 'Analysis Results',
                }
              }
            }
          ]
        }
      });

      const analysisHeaders = [
        'Analysis Date',
        'Analysis Type',
        'Title',
        'Key Findings',
        'Recommendation',
        'Action Items',
        'Confidence Score'
      ];

      await sheets.spreadsheets.values.update({
        auth: this.auth,
        spreadsheetId,
        range: 'Analysis Results!A1',
        valueInputOption: 'RAW',
        requestBody: {
          values: [analysisHeaders]
        }
      });

      return { sheetName: 'Analysis Results', created: true };
    } catch (error) {
      console.error('Error creating analysis sheet:', error);
      throw error;
    }
  }

  /**
   * Read data from sheet
   */
  async readSheetData(spreadsheetId, range) {
    try {
      const response = await sheets.spreadsheets.values.get({
        auth: this.auth,
        spreadsheetId,
        range,
      });
      return response.data.values || [];
    } catch (error) {
      console.error('Error reading sheet data:', error);
      throw error;
    }
  }

  /**
   * Write analysis results to the "Analysis Results" sheet
   */
  async writeAnalysisResults(spreadsheetId, analysisData) {
    try {
      if (!this.auth || typeof this.auth === 'string') {
        throw new Error('WRITE access requires Service Account or OAuth. API Key is Read-Only.');
      }
      const { title, findings, recommendation, confidence, actionItems } = analysisData;
      
      const row = [
        new Date().toISOString(),
        'Auto Analysis',
        title,
        findings,
        recommendation,
        actionItems?.join('; ') || '',
        confidence || 0
      ];

      // Append to Analysis Results sheet
      await sheets.spreadsheets.values.append({
        auth: this.auth,
        spreadsheetId,
        range: 'Analysis Results!A:G',
        valueInputOption: 'RAW',
        requestBody: {
          values: [row]
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Error writing analysis results:', error);
      throw error;
    }
  }

  /**
   * Check if user has access to the sheet
   */
  async checkSheetAccess(spreadsheetId) {
    try {
      await this.getSheetMetadata(spreadsheetId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get OAuth2 authorization URL
   */
  static getAuthUrl() {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.readonly'
    ];

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent'
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  static async getTokensFromCode(code) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    try {
      const { tokens } = await oauth2Client.getToken(code);
      return tokens;
    } catch (error) {
      console.error('Error getting tokens:', error);
      throw error;
    }
  }
}

export default GoogleSheetsService;
