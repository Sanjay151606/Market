import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Loader } from 'lucide-react';
import api from '../utils/api';
import InsightCard from '../components/InsightCard';
import './PriceTracker.css';

const PriceTracker = () => {
  const [selectedProduct, setSelectedProduct] = useState('');
  const [timeRange, setTimeRange] = useState('7d');
  const [products, setProducts] = useState([]);
  const [priceData, setPriceData] = useState([]);
  const [volatility, setVolatility] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [sheetPricingRows, setSheetPricingRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const formatINR = (value) => {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return '—';
    return `₹${numeric.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  };

  const parseInsights = (insights) => {
    if (!insights) return null;
    if (typeof insights === 'string') {
      try {
        return JSON.parse(insights);
      } catch {
        return null;
      }
    }
    return insights;
  };

  useEffect(() => {
    if (selectedProduct && products.length > 0) {
      fetchPriceComparison();
    }
  }, [selectedProduct, timeRange]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [productsRes, sheetAnalysisRes] = await Promise.all([
        api.getProducts(),
        api.getSheetAnalysis().catch(() => ({ analyses: [] }))
      ]);

      setProducts(productsRes.data || []);
      if (productsRes.data?.length > 0) {
        setSelectedProduct(productsRes.data[0].id);
      }

      const latestPricingAnalysis = (sheetAnalysisRes.analyses || []).find(
        (analysis) => {
          if (analysis.analysis_type !== 'pricing_analysis') return false;
          const insights = parseInsights(analysis.insights);
          return insights?.productComparisons?.length > 0;
        }
      );
      const parsedInsights = latestPricingAnalysis ? parseInsights(latestPricingAnalysis.insights) : null;
      setSheetPricingRows(parsedInsights?.productComparisons || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPriceComparison = async () => {
    try {
      const res = await api.getPriceComparison(selectedProduct);
      setPriceData(res.data?.priceHistory || []);
      setVolatility(res.data?.volatility || []);
      setRecommendations(res.data?.recommendations || []);
    } catch (error) {
      console.error('Error fetching price data:', error);
      setPriceData([]);
      setVolatility([]);
      setRecommendations([]);
    }
  };

  if (loading) {
    return (
      <div className="price-tracker">
        <div className="state-card">
          <Loader className="animate-spin" size={40} />
          <p>Loading price data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="price-tracker">
      <div className="page-header">
        <h1>Price Tracker</h1>
        <p>Monitor prices</p>
      </div>

      <div className="state-hint">Showing sheet-based pricing analysis</div>

      {sheetPricingRows.length > 0 ? (
        <div className="sheet-pricing-table-card">
          <h3 className="chart-title">Sheet Price Comparison & Recommended Sell Price</h3>
          <div className="sheet-pricing-table-wrap">
            <table className="sheet-pricing-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Current Price</th>
                  <th>Market Price</th>
                  <th>Recommended</th>
                  <th>Expected Margin %</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {sheetPricingRows.map((item, index) => (
                  <tr key={`${item.product}-${index}`}>
                    <td>{item.product}</td>
                    <td>{formatINR(item.currentPrice)}</td>
                    <td>{formatINR(item.marketPrice)}</td>
                    <td className="recommended-price">{formatINR(item.recommendedPrice)}</td>
                    <td>{item.expectedMarginPct}%</td>
                    <td>{item.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="state-card compact">
          <p>No sheet-based pricing analysis yet. Run analysis in Settings, then refresh this page.</p>
        </div>
      )}

      {products.length > 0 && (
        <>
          <div className="controls">
            <div className="control-group">
              <label>Product</label>
              <select value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
                {products.map(product => (
                  <option key={product.id} value={product.id}>{product.title}</option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <label>Time Range</label>
              <div className="button-group">
                <button
                  className={timeRange === '7d' ? 'active' : ''}
                  onClick={() => setTimeRange('7d')}
                >
                  7 Days
                </button>
                <button
                  className={timeRange === '30d' ? 'active' : ''}
                  onClick={() => setTimeRange('30d')}
                >
                  30 Days
                </button>
              </div>
            </div>
          </div>

          {recommendations.length > 0 && (
            <div className="recommendations-container">
              {recommendations.map((rec) => (
                <InsightCard
                  key={`price-rec-${rec.id}`}
                  insight={{
                    title: rec.title,
                    type: 'pricing',
                    urgency_score: rec.impact === 'high' ? 95 : 70,
                    confidence: rec.confidence || 85,
                    explanation: rec.description,
                    action: 'Review Pricing Strategy'
                  }}
                />
              ))}
            </div>
          )}

          {priceData.length > 0 && (
            <div className="chart-card">
              <h3 className="chart-title">Price Comparison</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={priceData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="yours" stroke="#6366f1" strokeWidth={3} name="Your Price" />
                  <Line type="monotone" dataKey="comp1" stroke="#ef4444" strokeWidth={2} name="Competitor A" />
                  <Line type="monotone" dataKey="comp2" stroke="#f59e0b" strokeWidth={2} name="Competitor B" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {volatility.length > 0 && (
            <div className="volatility-section">
              <h2 className="section-title">Price Volatility Indicators</h2>
              <div className="volatility-grid">
                {volatility.map((item, index) => (
                  <div key={index} className="volatility-card">
                    <div className="volatility-header">
                      <h4>{item.competitor}</h4>
                      {item.trend === 'down' ? (
                        <TrendingDown className="trend-icon down" size={20} />
                      ) : (
                        <TrendingUp className="trend-icon up" size={20} />
                      )}
                    </div>
                    <div className="volatility-value">{item.volatility}%</div>
                    <div className="volatility-bar">
                      <div
                        className="volatility-fill"
                        style={{ width: `${item.volatility * 10}%` }}
                      />
                    </div>
                    <p className="volatility-label">Price Change</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PriceTracker;
