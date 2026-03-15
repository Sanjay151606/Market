import { supabase, supabaseAdmin } from '../config/supabase.js';

// User functions
export const getUserById = async (userId) => {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
};

export const createUser = async (userData) => {
  const { data, error } = await supabase
    .from('users')
    .insert([userData])
    .select();
  if (error) throw error;
  return data[0];
};

// Product functions
export const getSellerProducts = async (sellerId) => {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const createProduct = async (productData) => {
  const { data, error } = await supabaseAdmin
    .from('products')
    .insert([productData])
    .select();
  if (error) throw error;
  return data[0];
};

export const updateProduct = async (productId, updates) => {
  const { data, error } = await supabaseAdmin
    .from('products')
    .update(updates)
    .eq('id', productId)
    .select();
  if (error) throw error;
  return data[0];
};

// Insights functions
export const getInsights = async (sellerId, filters = {}) => {
  let query = supabaseAdmin
    .from('insights')
    .select('*')
    .eq('seller_id', sellerId);

  if (filters.type) query = query.eq('type', filters.type);
  if (filters.urgency_min) query = query.gte('urgency_score', filters.urgency_min);
  if (filters.product_id) query = query.eq('product_id', filters.product_id);

  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);
  if (error) throw error;
  return data;
};

export const createInsight = async (insightData) => {
  const { data, error } = await supabaseAdmin
    .from('insights')
    .insert([insightData])
    .select();
  if (error) throw error;
  return data[0];
};

// Price functions
export const getPriceHistory = async (productId, days = 30) => {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - days);

  const { data, error } = await supabase
    .from('price_logs')
    .select('*')
    .eq('product_id', productId)
    .gte('timestamp', dateFrom.toISOString())
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data;
};

export const logPrice = async (priceData) => {
  const { data, error } = await supabase
    .from('price_logs')
    .insert([priceData])
    .select();
  if (error) throw error;
  return data[0];
};

// Competitor functions
export const getCompetitors = async (productId) => {
  const { data, error } = await supabase
    .from('competitors')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const updateCompetitorPrice = async (competitorId, newPrice) => {
  const { data, error } = await supabase
    .from('competitors')
    .update({ current_price: newPrice, last_updated: new Date().toISOString() })
    .eq('id', competitorId)
    .select();
  if (error) throw error;
  return data[0];
};

// Review functions
export const getProductReviews = async (productId) => {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('product_id', productId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
};

export const getReviewSentiment = async (productId) => {
  const { data, error } = await supabase
    .from('review_sentiment')
    .select('*')
    .eq('product_id', productId)
    .order('date', { ascending: true });
  if (error) throw error;
  return data;
};

export const insertReview = async (reviewData) => {
  const { data, error } = await supabase
    .from('reviews')
    .insert([reviewData])
    .select();
  if (error) throw error;
  return data[0];
};

// Logistics functions
export const getLogisticsData = async (sellerId) => {
  const { data, error } = await supabaseAdmin
    .from('logistics_logs')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
};

// Feedback functions
export const submitInsightFeedback = async (insightId, feedback) => {
  const { data, error } = await supabase
    .from('insight_feedback')
    .insert([{ insight_id: insightId, feedback }])
    .select();
  if (error) throw error;
  return data[0];
};

// Notification preferences
export const getNotificationPreferences = async (userId) => {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
};

export const updateNotificationPreferences = async (userId, preferences) => {
  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: userId, ...preferences })
    .select();
  if (error) throw error;
  return data[0];
};