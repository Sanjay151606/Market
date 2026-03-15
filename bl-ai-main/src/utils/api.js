import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

class APIClient {
  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add token to requests
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle responses
    this.client.interceptors.response.use(
      (response) => response.data,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          window.location.href = '/login';
        }
        throw error.response?.data || error;
      }
    );
  }

  // Auth endpoints
  register(email, password, fullName, companyName) {
    return this.client.post('/auth/register', {
      email,
      password,
      fullName,
      companyName
    });
  }

  login(email, password) {
    return this.client.post('/auth/login', { email, password });
  }

  getMe() {
    return this.client.get('/auth/me');
  }

  updateProfile(fullName, companyName) {
    return this.client.put('/auth/profile', { fullName, companyName });
  }

  // Product endpoints
  getProducts() {
    return this.client.get('/products');
  }

  getProduct(productId) {
    return this.client.get(`/products/${productId}`);
  }

  createProduct(productData) {
    return this.client.post('/products', productData);
  }

  updateProduct(productId, updates) {
    return this.client.put(`/products/${productId}`, updates);
  }

  deleteProduct(productId) {
    return this.client.delete(`/products/${productId}`);
  }

  // Insight endpoints
  getInsights(filters = {}) {
    const params = new URLSearchParams();
    if (filters.type) params.append('type', filters.type);
    if (filters.urgency) params.append('urgency', filters.urgency);
    if (filters.productId) params.append('productId', filters.productId);

    return this.client.get(`/insights?${params}`);
  }

  getInsight(insightId) {
    return this.client.get(`/insights/${insightId}`);
  }

  createInsight(insightData) {
    return this.client.post('/insights', insightData);
  }

  submitInsightFeedback(insightId, feedback) {
    return this.client.post(`/insights/${insightId}/feedback`, { feedback });
  }

  generateInsights(productIds) {
    return this.client.post('/insights/generate/batch', { productIds });
  }

  // Price endpoints
  getPriceHistory(productId, days = 30) {
    return this.client.get(`/prices/${productId}?days=${days}`);
  }

  getPriceComparison(productId, days = 7) {
    return this.client.get(`/prices/${productId}/comparison?days=${days}`);
  }

  logPrice(productId, price, source = 'self', platform = 'unknown') {
    return this.client.post(`/prices/${productId}/log`, {
      price,
      source,
      platform
    });
  }

  getPriceAnalytics(productId, days = 30) {
    return this.client.get(`/prices/${productId}/analytics?days=${days}`);
  }

  // Competitor endpoints
  getCompetitors(productId) {
    return this.client.get(`/competitors/${productId}`);
  }

  addCompetitor(competitorData) {
    return this.client.post('/competitors', competitorData);
  }

  updateCompetitorPrice(competitorId, newPrice) {
    return this.client.put(`/competitors/${competitorId}/price`, { newPrice });
  }

  getCompetitorRadarSummary() {
    return this.client.get('/competitors/radar/summary');
  }

  estimateCompetitorPrices(productName, ourPrice) {
    return this.client.post('/competitors/estimate-prices', { productName, ourPrice });
  }

  // Review endpoints
  getReviews(productId, limit = 50) {
    return this.client.get(`/reviews/${productId}?limit=${limit}`);
  }

  getReviewSentiment(productId) {
    return this.client.get(`/reviews/${productId}/sentiment`);
  }

  getEntitySentiment(productId) {
    return this.client.get(`/reviews/${productId}/entity-sentiment`);
  }

  getReviewTrend(productId, days = 30) {
    return this.client.get(`/reviews/${productId}/sentiment-trend?days=${days}`);
  }

  addReview(reviewData) {
    return this.client.post('/reviews', reviewData);
  }

  analyzeReviewUrl(url) {
    return this.client.post('/reviews/url-analyze', { url });
  }

  // Logistics endpoints
  getLogisticsData() {
    return this.client.get('/logistics');
  }

  getLogisticsComparison(days = 30, route = null) {
    let url = `/logistics/comparison?days=${days}`;
    if (route) url += `&route=${route}`;
    return this.client.get(url);
  }

  logShipment(shipmentData) {
    return this.client.post('/logistics/shipment/log', shipmentData);
  }

  getRouteAnalytics(route, days = 30) {
    return this.client.get(`/logistics/${route}/analytics?days=${days}`);
  }

  optimizeTransportRoute(fromPlace, toPlace, targetDurationHours, avoidTollGates = false) {
    return this.client.post('/logistics/transport/optimize', {
      fromPlace,
      toPlace,
      targetDurationHours,
      avoidTollGates
    });
  }

  // Notification endpoints
  getNotificationPreferences() {
    return this.client.get('/notifications/preferences');
  }

  updateNotificationPreferences(preferences) {
    return this.client.put('/notifications/preferences', preferences);
  }

  getAlerts() {
    return this.client.get('/notifications/alerts');
  }

  markAlertAsRead(alertId) {
    return this.client.put(`/notifications/alerts/${alertId}/read`);
  }

  markAllAlertsAsRead() {
    return this.client.put('/notifications/alerts/mark-all-read');
  }

  deleteAlert(alertId) {
    return this.client.delete(`/notifications/alerts/${alertId}`);
  }

  // Google Sheets endpoints
  getSheetAuthUrl() {
    return this.client.get('/sheets/auth-url');
  }

  configureGoogleSheet(sheetUrl, accessToken) {
    return this.client.post('/sheets/configure', { sheetUrl, accessToken });
  }

  getSheetStatus() {
    return this.client.get('/sheets/status');
  }

  getSheetAnalysis() {
    return this.client.get('/sheets/analysis');
  }

  triggerSheetAnalysis() {
    return this.client.post('/sheets/analyze');
  }

  disconnectGoogleSheet() {
    return this.client.delete('/sheets/disconnect');
  }

  // Chatbot endpoints
  sendChatMessage(message, conversationHistory = [], pageContext = {}) {
    return this.client.post('/chatbot/message', {
      message,
      conversationHistory,
      pageContext
    });
  }
}

export default new APIClient();
