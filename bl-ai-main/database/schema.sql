-- MarketMind AI - Supabase Database Schema
-- Copy and paste this in the Supabase SQL Editor

-- Clean start: Drop existing tables if they exist (Reverse order of dependencies)
DROP TABLE IF EXISTS business_data_entries CASCADE;
DROP TABLE IF EXISTS sheet_analysis_results CASCADE;
DROP TABLE IF EXISTS google_sheets_connections CASCADE;
DROP TABLE IF EXISTS notification_preferences CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS logistics_logs CASCADE;
DROP TABLE IF EXISTS insight_feedback CASCADE;
DROP TABLE IF EXISTS insights CASCADE;
DROP TABLE IF EXISTS review_sentiment CASCADE;
DROP TABLE IF EXISTS review_entities CASCADE;
DROP TABLE IF EXISTS review_analysis CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS competitor_events CASCADE;
DROP TABLE IF EXISTS competitors CASCADE;
DROP TABLE IF EXISTS price_logs CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  company_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Products Table
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  asin VARCHAR(50),
  fsn VARCHAR(50),
  category VARCHAR(255),
  current_price DECIMAL(10, 2),
  image_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Price Logs Table
CREATE TABLE price_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  price DECIMAL(10, 2) NOT NULL,
  source VARCHAR(100), -- 'self', 'amazon', 'flipkart', etc.
  platform VARCHAR(100),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Competitors Table
CREATE TABLE competitors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  platform VARCHAR(100), -- 'amazon', 'flipkart', etc.
  asin VARCHAR(50),
  fsn VARCHAR(50),
  current_price DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Competitor Events Log
CREATE TABLE competitor_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  competitor_id UUID NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
  event_type VARCHAR(100), -- 'price_change', 'bundle_launch', 'rating_change'
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reviews Table
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source VARCHAR(100), -- 'amazon', 'flipkart', etc.
  source_id VARCHAR(255),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  text TEXT NOT NULL,
  author VARCHAR(255),
  verified BOOLEAN DEFAULT FALSE,
  platform VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Review Analysis Table
CREATE TABLE review_analysis (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  review_id UUID NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  sentiment VARCHAR(50), -- 'positive', 'neutral', 'negative'
  confidence DECIMAL(3, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Review Entities (aspect-level sentiment)
CREATE TABLE review_entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  aspect VARCHAR(100), -- 'packaging', 'quality', 'delivery', 'price'
  sentiment VARCHAR(50), -- 'positive', 'neutral', 'negative'
  mention_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Review Sentiment Aggregates
CREATE TABLE review_sentiment (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  date DATE DEFAULT CURRENT_DATE,
  positive_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  average_rating DECIMAL(3, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insights Table
CREATE TABLE insights (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  type VARCHAR(100), -- 'pricing', 'product_improvement', 'logistics_optimization'
  title VARCHAR(500) NOT NULL,
  explanation TEXT NOT NULL,
  action TEXT NOT NULL,
  urgency_score INTEGER CHECK (urgency_score >= 1 AND urgency_score <= 100),
  confidence DECIMAL(5, 2),
  supporting_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insight Feedback
CREATE TABLE insight_feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  insight_id UUID NOT NULL REFERENCES insights(id) ON DELETE CASCADE,
  feedback VARCHAR(50), -- 'helpful', 'not_helpful', 'applied', 'ignored'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Logistics Logs
CREATE TABLE logistics_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id VARCHAR(100),
  provider VARCHAR(100), -- 'delhivery', 'shiprocket', etc.
  route VARCHAR(255),
  weight DECIMAL(10, 2),
  cost DECIMAL(10, 2),
  estimated_delivery DATE,
  status VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alerts Table
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(100), -- 'insight', 'price_alert', 'competitor_alert'
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  insight_id UUID REFERENCES insights(id) ON DELETE CASCADE,
  urgency VARCHAR(50), -- 'low', 'medium', 'high'
  action_url TEXT,
  read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notification Preferences
CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email BOOLEAN DEFAULT TRUE,
  whatsapp BOOLEAN DEFAULT FALSE,
  push BOOLEAN DEFAULT TRUE,
  urgency_threshold INTEGER DEFAULT 5,
  digest_frequency VARCHAR(50) DEFAULT 'daily', -- 'instant', 'daily', 'weekly'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Google Sheets Connections
CREATE TABLE google_sheets_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sheet_id VARCHAR(255) NOT NULL,
  sheet_url TEXT NOT NULL,
  sheet_name VARCHAR(255) NOT NULL,
  auth_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  created_columns BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'connected', -- 'connected', 'disconnected', 'error'
  last_sync TIMESTAMP,
  sync_frequency VARCHAR(50) DEFAULT 'hourly', -- 'realtime', 'hourly', 'daily'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sheet Analysis Results
CREATE TABLE sheet_analysis_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES google_sheets_connections(id) ON DELETE CASCADE,
  analysis_type VARCHAR(100), -- 'sales_trend', 'inventory_alert', 'pricing_analysis', 'competitor_research'
  title VARCHAR(500) NOT NULL,
  description TEXT,
  insights JSONB,
  recommendations JSONB,
  metrics JSONB,
  confidence_score DECIMAL(3, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  analyzed_at TIMESTAMP
);

-- Business Data from Sheets
CREATE TABLE business_data_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES google_sheets_connections(id) ON DELETE CASCADE,
  data_type VARCHAR(100), -- 'sales', 'inventory', 'customer', 'competitor'
  raw_data JSONB NOT NULL,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_logs_product_id ON price_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_price_logs_timestamp ON price_logs(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_competitors_product_id ON competitors(product_id);

CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_insights_seller_id ON insights(seller_id);
CREATE INDEX IF NOT EXISTS idx_insights_urgency ON insights(urgency_score DESC);
CREATE INDEX IF NOT EXISTS idx_insights_created_at ON insights(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_user_id ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_read ON alerts(read);

CREATE INDEX IF NOT EXISTS idx_logistics_seller_id ON logistics_logs(seller_id);

CREATE INDEX IF NOT EXISTS idx_gs_connections_user_id ON google_sheets_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_sheet_analysis_user_id ON sheet_analysis_results(user_id);
CREATE INDEX IF NOT EXISTS idx_sheet_analysis_created ON sheet_analysis_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_data_user_id ON business_data_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_business_data_created ON business_data_entries(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE google_sheets_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE sheet_analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_data_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Products (users can only see their own products)
CREATE POLICY "Users can view their own products"
  ON products FOR SELECT
  USING (auth.uid()::text = seller_id::text);

CREATE POLICY "Users can insert their own products"
  ON products FOR INSERT
  WITH CHECK (auth.uid()::text = seller_id::text);

CREATE POLICY "Users can update their own products"
  ON products FOR UPDATE
  USING (auth.uid()::text = seller_id::text)
  WITH CHECK (auth.uid()::text = seller_id::text);

CREATE POLICY "Users can delete their own products"
  ON products FOR DELETE
  USING (auth.uid()::text = seller_id::text);

-- RLS Policies for Insights
CREATE POLICY "Users can view their own insights"
  ON insights FOR SELECT
  USING (auth.uid()::text = seller_id::text);

CREATE POLICY "Users can insert insights"
  ON insights FOR INSERT
  WITH CHECK (auth.uid()::text = seller_id::text);

-- RLS Policies for Alerts
CREATE POLICY "Users can view their own alerts"
  ON alerts FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can manage their own alerts"
  ON alerts FOR UPDATE
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete their own alerts"
  ON alerts FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- RLS Policies for Google Sheets Connections
CREATE POLICY "Users can view their own sheet connections"
  ON google_sheets_connections FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert their own sheet connections"
  ON google_sheets_connections FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update their own sheet connections"
  ON google_sheets_connections FOR UPDATE
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete their own sheet connections"
  ON google_sheets_connections FOR DELETE
  USING (auth.uid()::text = user_id::text);

-- RLS Policies for Sheet Analysis Results
CREATE POLICY "Users can view their own analysis results"
  ON sheet_analysis_results FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert analysis results"
  ON sheet_analysis_results FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

-- RLS Policies for Business Data Entries
CREATE POLICY "Users can view their own business data"
  ON business_data_entries FOR SELECT
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert business data"
  ON business_data_entries FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

-- Sample Data (Optional)
-- INSERT INTO users (email, full_name, company_name) VALUES
-- ('seller@example.com', 'John Seller', 'My E-commerce Store');

-- Grant Permissions (if needed)
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;