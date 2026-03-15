import { useEffect, useState } from 'react';
import { Settings, Link2, CheckCircle, AlertCircle, Loader, Copy, Trash2 } from 'lucide-react';
import api from '../utils/api';
import './ProfileSettings.css';

const ProfileSettings = () => {
  const [user, setUser] = useState(null);
  const [sheets, setSheets] = useState(null);
  const [loading, setLoading] = useState(true);
  const [configuring, setConfiguring] = useState(false);
  const [sheetUrl, setSheetUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  useEffect(() => {
    fetchProfile();
    fetchSheetStatus();
  }, []);

  const fetchProfile = async () => {
    try {
      const userData = JSON.parse(localStorage.getItem('user'));
      setUser(userData);
    } catch {
      setUser(null);
    }
  };

  const fetchSheetStatus = async () => {
    try {
      setLoading(true);
      const response = await api.getSheetStatus();
      setSheets(response);
    } catch (error) {
      console.error('Error fetching sheet status:', error);
      setSheets({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  const handleConfigureSheet = async () => {
    if (!sheetUrl.trim()) {
      setMessage('Please enter a valid Google Sheets URL');
      setMessageType('error');
      return;
    }

    try {
      setConfiguring(true);
      setMessage('Connecting to your Google Sheet...');
      setMessageType('info');

      // Simple link-based configuration using the provided URL
      const response = await api.configureGoogleSheet(sheetUrl, 'api_key_mode');

      setMessage(response.message || 'Google Sheet linked successfully!');
      setMessageType('success');
      setSheetUrl('');
      setShowUrlInput(false);

      // Refresh connection status UI
      setTimeout(fetchSheetStatus, 1500);
    } catch (error) {
      console.error('Configuration error:', error);

      const errorMessage = error.error || error.response?.data?.error || 'Failed to configure sheet';

      if (errorMessage.toLowerCase().includes('database') || errorMessage.toLowerCase().includes('relation')) {
        setMessage('Backend Error: Database tables not created. Please see DATABASE_SETUP.md');
      } else if (errorMessage.toLowerCase().includes('share') || errorMessage.toLowerCase().includes('editor') || error.response?.status === 403) {
        setMessage(errorMessage); // Already formatted by backend for Service Account instruction
      } else if (errorMessage.toLowerCase().includes('auth') || errorMessage.toLowerCase().includes('credential')) {
        setMessage('API Error: System is missing Google Service Account credentials.');
      } else {
        setMessage(errorMessage);
      }

      setMessageType('error');
    } finally {
      setConfiguring(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect this Google Sheet?')) {
      return;
    }

    try {
      await api.disconnectGoogleSheet();
      setMessage('Google Sheet disconnected');
      setMessageType('success');
      fetchSheetStatus();
    } catch (error) {
      setMessage('Failed to disconnect');
      setMessageType('error');
    }
  };

  const handleManualAnalysis = async () => {
    try {
      setMessage('Running analysis...');
      setMessageType('info');

      const response = await api.triggerSheetAnalysis();
      setMessage(`Analysis complete: ${response.analyses?.length || 0} insights generated`);
      setMessageType('success');
    } catch (error) {
      setMessage('Failed to run analysis');
      setMessageType('error');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setMessage('Copied to clipboard!');
    setMessageType('success');
    setTimeout(() => setMessage(''), 2000);
  };

  if (loading) {
    return (
      <div className="profile-settings">
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Loader className="animate-spin" size={40} style={{ margin: '0 auto' }} />
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-settings">
      <div className="settings-header">
        <h1>
          <Settings size={28} />
          Account Settings
        </h1>
        <p>Manage your account and data integrations</p>
      </div>

      {/* Profile Section */}
      <div className="settings-section">
        <h2>Profile Information</h2>
        {user && (
          <div className="profile-info">
            <div className="info-item">
              <label>Email</label>
              <p>{user.email}</p>
            </div>
            {user.full_name && (
              <div className="info-item">
                <label>Name</label>
                <p>{user.full_name}</p>
              </div>
            )}
            {user.company_name && (
              <div className="info-item">
                <label>Company</label>
                <p>{user.company_name}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Google Sheets Integration */}
      <div className="settings-section">
        <div className="section-header">
          <h2>
            <Link2 size={24} />
            Business Data Link (Google Sheets)
          </h2>
          <p>Connect your Google Sheet to get automated business insights</p>
        </div>

        {message && (
          <div className={`message-banner ${messageType}`}>
            {messageType === 'error' && <AlertCircle size={20} />}
            {messageType === 'success' && <CheckCircle size={20} />}
            {messageType === 'info' && <Loader size={20} className="animate-spin" />}
            <span>{message}</span>
          </div>
        )}

        {sheets?.connected ? (
          <div className="connected-sheet">
            <div className="connection-status connected">
              <CheckCircle size={24} color="#10b981" />
              <div className="status-text">
                <p className="status-title">Sheet Connected</p>
                <p className="status-detail">{sheets.connection.sheet_name}</p>
              </div>
            </div>

            <div className="sheet-details">
              <div className="detail-item">
                <span className="detail-label">Sheet URL:</span>
                <div className="detail-value-with-copy">
                  <code>{sheets.connection.sheet_url}</code>
                  <button
                    className="copy-btn"
                    onClick={() => copyToClipboard(sheets.connection.sheet_url)}
                    title="Copy URL"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>
              <div className="detail-item">
                <span className="detail-label">Status:</span>
                <span className="status-badge">{sheets.connection.status}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Last Synced:</span>
                <span>{new Date(sheets.connection.last_sync).toLocaleString()}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Columns Created:</span>
                <span>{sheets.connection.created_columns ? '✓ Yes' : '✗ No'}</span>
              </div>
            </div>

            <div className="sheet-actions">
              <button
                className="btn btn-primary"
                onClick={handleManualAnalysis}
              >
                Run Analysis Now
              </button>
              <button
                className="btn btn-outline"
                onClick={handleDisconnect}
              >
                <Trash2 size={16} />
                Disconnect Sheet
              </button>
            </div>

            <div className="setup-info">
              <h4>Sheet Structure</h4>
              <ul>
                <li><strong>Business Data:</strong> Enter your sales, inventory, and review data here</li>
                <li><strong>Analysis Results:</strong> Your automated insights appear here</li>
              </ul>
              <h4 style={{ marginTop: '20px' }}>Expected Columns</h4>
              <div className="columns-list">
                <code>Date | Product Name | SKU | Units Sold | Sale Price | Total Revenue | Customer Count | Customer Reviews | Average Rating | Competitor Price | Inventory Level | Reorder Status | Stock Qty | Purchase Price | Selling Price | Last Restock</code>
              </div>
            </div>
          </div>
        ) : (
          <div className="no-sheet">
            <div className="intro-box">
              <h3>Get Started with Business Data Automation</h3>
              <p>Connect your Google Sheet to receive:</p>
              <ul>
                <li>✓ Sales trend analysis and forecasting</li>
                <li>✓ Inventory alerts and optimization</li>
                <li>✓ Pricing recommendations</li>
                <li>✓ Competitor price tracking</li>
                <li>✓ Customer sentiment analysis</li>
                <li>✓ Dynamic business insights</li>
              </ul>
            </div>

            {!showUrlInput ? (
              <button
                className="btn btn-primary btn-large"
                onClick={() => setShowUrlInput(true)}
              >
                <Link2 size={20} />
                Configure Google Sheet
              </button>
            ) : (
              <div className="sheet-input-form">
                <div className="input-group">
                  <label>Google Sheets URL</label>
                  <input
                    type="url"
                    placeholder="https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit"
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                    className="sheet-url-input"
                  />
                  <small className="help-text">
                    Create a new Google Sheet, then paste its URL here. Make sure it's shared with your Google account.
                  </small>
                </div>

                <div className="form-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleConfigureSheet}
                    disabled={configuring}
                  >
                    {configuring ? (
                      <>
                        <Loader size={16} className="animate-spin" />
                        Configuring...
                      </>
                    ) : (
                      'Configure Sheet'
                    )}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowUrlInput(false)}
                    disabled={configuring}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Data Privacy */}
      <div className="settings-section">
        <h2>Data & Privacy</h2>
        <div className="privacy-info">
          <p><strong>Your data is secure:</strong></p>
          <ul>
            <li>✓ All data is encrypted in transit (HTTPS)</li>
            <li>✓ Database uses role-based access control</li>
            <li>✓ Only your own data is visible to you</li>
            <li>✓ Google Sheet access via OAuth 2.0</li>
            <li>✓ Analysis runs locally - data never shared</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettings;
