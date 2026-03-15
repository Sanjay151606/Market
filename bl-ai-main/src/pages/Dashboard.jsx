import { useEffect, useState } from 'react';
import { Package, Lightbulb, DollarSign, TrendingUp, AlertCircle, Zap } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { motion } from 'framer-motion';
import MetricsCard from '../components/MetricsCard';
import InsightCard from '../components/InsightCard';
import api from '../utils/api';
import realtime from '../utils/realtime';
import './Dashboard.css';

const parseMaybeJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
};

const normalizeScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 50;
  return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
};

const toDayLabel = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
};

const normalizePriceSeries = (rows = []) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  if (rows[0].date && (rows[0].yours !== undefined || rows[0].competitor !== undefined)) {
    return rows.map((row) => ({
      date: row.date,
      yours: Number(row.yours ?? row.price ?? 0),
      competitor: Number(row.competitor ?? row.comp1 ?? row.comp2 ?? 0),
    }));
  }

  const bucket = new Map();

  rows.forEach((row) => {
    const rawDate = row.timestamp || row.created_at || row.date;
    const key = rawDate ? new Date(rawDate).toISOString().slice(0, 10) : 'unknown';
    const priceValue = Number(row.price ?? row.current_price ?? 0);
    if (!bucket.has(key)) {
      bucket.set(key, {
        rawDate: rawDate || new Date().toISOString(),
        yoursValues: [],
        competitorValues: [],
      });
    }

    const item = bucket.get(key);
    if (row.source === 'self' || row.source === 'ours' || row.platform === 'our_company') {
      item.yoursValues.push(priceValue);
    } else {
      item.competitorValues.push(priceValue);
    }
  });

  return Array.from(bucket.values())
    .sort((a, b) => new Date(a.rawDate) - new Date(b.rawDate))
    .map((entry) => {
      const yours = entry.yoursValues.length
        ? entry.yoursValues.reduce((sum, value) => sum + value, 0) / entry.yoursValues.length
        : null;
      const competitor = entry.competitorValues.length
        ? entry.competitorValues.reduce((sum, value) => sum + value, 0) / entry.competitorValues.length
        : null;

      return {
        date: toDayLabel(entry.rawDate),
        yours: yours !== null ? Number(yours.toFixed(2)) : null,
        competitor: competitor !== null ? Number(competitor.toFixed(2)) : null,
      };
    });
};

const normalizeSentimentSeries = (insightRows = []) => {
  if (!Array.isArray(insightRows) || insightRows.length === 0) return [];

  for (const insight of insightRows) {
    const metrics = parseMaybeJson(insight.metrics) || {};
    const supporting = parseMaybeJson(insight.supporting_data) || {};
    const history = metrics.sentiment_history || supporting.sentiment_history;
    if (Array.isArray(history) && history.length > 0) {
      return history.map((point) => ({
        date: point.date || toDayLabel(point.timestamp || insight.created_at || new Date().toISOString()),
        positive: Number(point.positive ?? point.pos ?? 0),
        neutral: Number(point.neutral ?? point.neu ?? 0),
        negative: Number(point.negative ?? point.neg ?? 0),
      }));
    }
  }

  const points = insightRows
    .map((insight) => {
      const metrics = parseMaybeJson(insight.metrics) || {};
      const supporting = parseMaybeJson(insight.supporting_data) || {};
      const snapshot = metrics.sentiment || supporting.sentiment || metrics.sentiment_score || null;

      if (!snapshot || typeof snapshot !== 'object') return null;

      return {
        date: toDayLabel(insight.created_at || new Date().toISOString()),
        positive: Number(snapshot.positive ?? snapshot.pos ?? 0),
        neutral: Number(snapshot.neutral ?? snapshot.neu ?? 0),
        negative: Number(snapshot.negative ?? snapshot.neg ?? 0),
      };
    })
    .filter(Boolean);

  return points.slice(-7);
};

const toNumber = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const normalizeSheetPriceSeries = (analyses = []) => {
  if (!Array.isArray(analyses) || analyses.length === 0) return [];

  const latestPricing = analyses.find((analysis) => analysis.analysis_type === 'pricing_analysis');
  if (!latestPricing) return [];

  const parsedInsights = parseMaybeJson(latestPricing.insights) || {};
  const comparisons = Array.isArray(parsedInsights.productComparisons)
    ? parsedInsights.productComparisons
    : [];

  if (comparisons.length === 0) return [];

  return comparisons
    .map((item, index) => {
      const ours = toNumber(item.currentPrice);
      const market = toNumber(item.marketPrice);
      if (ours === null && market === null) return null;

      return {
        date: item.product || `Product ${index + 1}`,
        yours: ours,
        competitor: market,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
};

const normalizeSheetSentimentSeries = (analyses = []) => {
  if (!Array.isArray(analyses) || analyses.length === 0) return [];

  const rows = analyses
    .filter((analysis) => analysis.analysis_type === 'review_analysis')
    .map((analysis) => {
      const parsedInsights = parseMaybeJson(analysis.insights) || {};
      const parsedMetrics = parseMaybeJson(analysis.metrics) || {};

      const ratingValue =
        toNumber(parsedInsights.avgRating) ??
        toNumber(parsedMetrics.avgRating) ??
        null;

      if (ratingValue === null) return null;

      const boundedRating = Math.max(1, Math.min(5, ratingValue));
      const positive = (boundedRating / 5) * 70;
      const negative = ((5 - boundedRating) / 5) * 50;
      const neutral = Math.max(0, 100 - positive - negative);

      return {
        rawDate: analysis.created_at || analysis.analyzed_at || new Date().toISOString(),
        date: toDayLabel(analysis.created_at || analysis.analyzed_at || new Date().toISOString()),
        positive: Number(positive.toFixed(2)),
        neutral: Number(neutral.toFixed(2)),
        negative: Number(negative.toFixed(2)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.rawDate) - new Date(b.rawDate));

  return rows.slice(-7).map(({ rawDate, ...rest }) => rest);
};

const getLatestPricingSummary = (analyses = []) => {
  const latestPricing = analyses.find((analysis) => analysis.analysis_type === 'pricing_analysis');
  if (!latestPricing) {
    return {
      productsAnalyzed: 0,
      increaseCandidates: 0,
      reductionCandidates: 0,
    };
  }

  const parsedInsights = parseMaybeJson(latestPricing.insights) || {};
  const parsedMetrics = parseMaybeJson(latestPricing.metrics) || {};
  const summary = parsedInsights.summary || {};
  const comparisons = Array.isArray(parsedInsights.productComparisons)
    ? parsedInsights.productComparisons
    : [];

  return {
    productsAnalyzed: Number(
      parsedMetrics.productsAnalyzed ?? summary.productsAnalyzed ?? comparisons.length ?? 0
    ) || 0,
    increaseCandidates: Number(
      parsedMetrics.increaseCandidates ?? summary.priceIncreaseCandidates ?? 0
    ) || 0,
    reductionCandidates: Number(
      parsedMetrics.reductionCandidates ?? summary.priceReductionCandidates ?? 0
    ) || 0,
  };
};

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState([]);
  const [products, setProducts] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [metrics, setMetrics] = useState([
    { title: 'Total Products Tracked', value: '0', change: 0, icon: Package, color: '#6366f1' },
    { title: 'Active AI Insights', value: '0', change: 0, icon: Lightbulb, color: '#f59e0b' },
    { title: 'Urgent & Product sales Improve', value: '0', change: 0, icon: AlertCircle, color: '#ef4444' },
    { title: 'Est. Revenue Opportunity', value: '₹0', change: 0, icon: DollarSign, color: '#10b981' },
  ]);
  const [priceData, setPriceData] = useState([]);
  const [sentimentData, setSentimentData] = useState([]);
  const [priceEmptyReason, setPriceEmptyReason] = useState('No price data available');
  const [sentimentEmptyReason, setSentimentEmptyReason] = useState('No sentiment data available');

  useEffect(() => {
    fetchDashboardData();
    subscribeToRealtime();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);

      const [productsRes, insightsRes, alertsRes, sheetAnalysisRes] = await Promise.all([
        api.getProducts(),
        api.getInsights(),
        api.getAlerts(),
        api.getSheetAnalysis().catch(() => ({ analyses: [] }))
      ]);

      setProducts(productsRes.data);

      const transformedSheetAnalyses = (sheetAnalysisRes.analyses || []).map(analysis => ({
        id: analysis.id,
        title: analysis.title,
        explanation: analysis.description,
        action: (Array.isArray(parseMaybeJson(analysis.recommendations))
          ? parseMaybeJson(analysis.recommendations)[0]
          : analysis.recommendations?.[0]) || 'Review analysis',
        urgency: normalizeScore(analysis.confidence_score || 0.5),
        confidence: normalizeScore(analysis.confidence_score || 0.5),
        type: analysis.analysis_type,
        metrics: analysis.metrics,
        category: analysis.analysis_type?.replace(/_/g, ' ')
      }));

      const allInsights = [...insightsRes.data, ...transformedSheetAnalyses];
      const topInsights = allInsights.slice(0, 3);
      setInsights(topInsights);
      setAlerts(alertsRes.data || []);

      const totalOpp = allInsights.reduce((sum, ins) => {
        const parsedMetrics = parseMaybeJson(ins.metrics) || {};
        const value = Number(parsedMetrics.revenue_opportunity ?? parsedMetrics.revenueOpportunity ?? 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);

      const pricingSummary = getLatestPricingSummary(sheetAnalysisRes.analyses || []);
      const productsTrackedCount = (productsRes.data?.length || 0) > 0
        ? (productsRes.data?.length || 0)
        : pricingSummary.productsAnalyzed;
      const urgentImproveCount =
        (alertsRes.data?.length || 0) +
        pricingSummary.increaseCandidates +
        pricingSummary.reductionCandidates;

      setMetrics([
        { title: 'Total Products Tracked', value: productsTrackedCount.toString(), change: 0, icon: Package, color: '#6366f1' },
        { title: 'Active AI Insights', value: (allInsights.length || 0).toString(), change: 0, icon: Lightbulb, color: '#f59e0b' },
        { title: 'Urgent & Product sales Improve', value: urgentImproveCount.toString(), change: 0, icon: AlertCircle, color: '#ef4444' },
        { title: 'Est. Revenue Opportunity', value: `₹${totalOpp.toLocaleString('en-IN')}`, change: 0, icon: DollarSign, color: '#10b981' },
      ]);

      if (productsRes.data && productsRes.data.length > 0) {
        generateChartData(productsRes.data[0].id, sheetAnalysisRes.analyses || []);
      } else {
        const sheetPrice = normalizeSheetPriceSeries(sheetAnalysisRes.analyses || []);
        const sheetSentiment = normalizeSheetSentimentSeries(sheetAnalysisRes.analyses || []);

        setPriceData(sheetPrice);
        setSentimentData(sheetSentiment);
        setPriceEmptyReason(
          sheetPrice.length > 0
            ? 'No live product logs found. Showing sheet-based pricing trend.'
            : 'No products tracked yet. Add a product in Price Tracker to see live price trends.'
        );
        setSentimentEmptyReason(
          sheetSentiment.length > 0
            ? 'No live review data found. Showing sheet-based sentiment trend.'
            : 'No products tracked yet. Add a product to see customer sentiment trends.'
        );
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateChartData = async (productId, sheetAnalyses = []) => {
    try {
      setPriceEmptyReason('No price data available');
      setSentimentEmptyReason('No sentiment data available');
      let hasPriceData = false;
      let hasSentimentData = false;

      const priceRes = await api.getPriceHistory(productId, 7);
      const normalizedPrices = normalizePriceSeries(priceRes.data || []);
      if (normalizedPrices.length > 0) {
        setPriceData(normalizedPrices);
        hasPriceData = true;
      } else {
        const comparisonRes = await api.getPriceComparison(productId, 7);
        const comparisonRows = comparisonRes?.data?.priceHistory || [];
        const fallbackPrices = normalizePriceSeries(comparisonRows);
        setPriceData(fallbackPrices);
        if (fallbackPrices.length > 0) {
          hasPriceData = true;
        } else {
          setPriceEmptyReason('No price logs found for this product yet.');
        }
      }

      const insights = await api.getInsights({ productId, type: 'review_intelligence' });
      const normalizedSentiment = normalizeSentimentSeries(insights.data || []);
      if (normalizedSentiment.length > 0) {
        setSentimentData(normalizedSentiment);
        hasSentimentData = true;
      } else {
        setSentimentEmptyReason('No review sentiment analysis available for this product yet.');
      }

      if (!hasPriceData) {
        const sheetPrice = normalizeSheetPriceSeries(sheetAnalyses);
        if (sheetPrice.length > 0) {
          setPriceData(sheetPrice);
          setPriceEmptyReason('Using sheet-based pricing trend (live logs not available).');
        }
      }

      if (!hasSentimentData) {
        const sheetSentiment = normalizeSheetSentimentSeries(sheetAnalyses);
        if (sheetSentiment.length > 0) {
          setSentimentData(sheetSentiment);
          setSentimentEmptyReason('Using sheet-based sentiment trend (live review analysis not available).');
        }
      }
    } catch (error) {
      console.error('Error generating chart data:', error);
      const sheetPrice = normalizeSheetPriceSeries(sheetAnalyses);
      const sheetSentiment = normalizeSheetSentimentSeries(sheetAnalyses);

      setPriceData(sheetPrice);
      setSentimentData(sheetSentiment);
      setPriceEmptyReason(
        sheetPrice.length > 0
          ? 'Using sheet-based pricing trend (live API unavailable).'
          : 'Unable to load price trend data right now.'
      );
      setSentimentEmptyReason(
        sheetSentiment.length > 0
          ? 'Using sheet-based sentiment trend (live API unavailable).'
          : 'Unable to load sentiment trend data right now.'
      );
    }
  };

  const subscribeToRealtime = () => {
    realtime.on('new-insight', (insight) => {
      setInsights(prev => [insight, ...prev.slice(0, 2)]);
    });

    realtime.on('new-alert', (alert) => {
      setAlerts(prev => [alert, ...prev]);
    });
  };

  if (loading) {
    return (
      <div className="dashboard loading">
        <div className="skeleton-loader">
          <div className="skeleton" style={{ height: '100px' }}></div>
          <div className="skeleton" style={{ height: '300px' }}></div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Your Real-Time Marketplace Intelligence</p>
        </div>
        {alerts.length > 0 && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="alert-badge"
          >
            {alerts.length} Urgent Alerts
          </motion.div>
        )}
      </div>

      <div className="metrics-grid">
        {metrics.map((metric, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <MetricsCard {...metric} />
          </motion.div>
        ))}
      </div>

      <div className="insights-section">
        <div className="section-header">
          <h2 className="section-title">AI Recommendations</h2>
          <button className="view-all-btn">View All →</button>
        </div>
        <div className="insights-grid">
          {insights.length > 0 ? (
            insights.map((insight, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
              >
                <InsightCard insight={insight} />
              </motion.div>
            ))
          ) : (
            <div className="empty-state">
              <Zap size={32} />
              <p>No insights yet. Add products to get started!</p>
            </div>
          )}
        </div>
      </div>

      <div className="charts-section">
        <motion.div
          className="chart-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="chart-header">
            <h3 className="chart-title">Price Trend Comparison</h3>
            <TrendingUp size={20} className="chart-icon" />
          </div>
          {priceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={priceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                <Legend />
                <Line type="monotone" dataKey="yours" stroke="#6366f1" strokeWidth={3} name="Your Price" dot={{ fill: '#6366f1', r: 5 }} />
                <Line type="monotone" dataKey="competitor" stroke="#ef4444" strokeWidth={2} name="Competitor Price" strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">{priceEmptyReason}</div>
          )}
        </motion.div>

        <motion.div
          className="chart-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <div className="chart-header">
            <h3 className="chart-title">Customer Sentiment Trends</h3>
            <AlertCircle size={20} className="chart-icon" />
          </div>
          {sentimentData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={sentimentData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                <Legend />
                <Area type="monotone" dataKey="positive" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="Positive" />
                <Area type="monotone" dataKey="neutral" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} name="Neutral" />
                <Area type="monotone" dataKey="negative" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.6} name="Negative" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-chart">{sentimentEmptyReason}</div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;
