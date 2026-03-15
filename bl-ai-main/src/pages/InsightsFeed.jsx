import { useEffect, useState } from 'react';
import { Loader } from 'lucide-react';
import InsightCard from '../components/InsightCard';
import api from '../utils/api';
import realtime from '../utils/realtime';
import './InsightsFeed.css';

const InsightsFeed = () => {
  const [filter, setFilter] = useState('all');
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const normalizeScore = (value, fallback = 50) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric);
  };

  const normalizeInsight = (insight) => ({
    ...insight,
    type: insight.type || insight.analysis_type || 'general',
    category: insight.category || insight.type || insight.analysis_type || 'general',
    explanation: insight.explanation || insight.description || '',
    action:
      insight.action ||
      (Array.isArray(parseMaybeJson(insight.recommendations))
        ? parseMaybeJson(insight.recommendations)[0]
        : Array.isArray(insight.recommendations)
          ? insight.recommendations[0]
          : 'Review this insight'),
    urgency: normalizeScore(insight.urgency ?? insight.urgency_score ?? insight.confidence_score, 50),
    confidence: normalizeScore(insight.confidence ?? insight.confidence_score, 50)
  });

  useEffect(() => {
    fetchInsights();

    const onNewInsight = (newInsight) => {
      setInsights(prev => [normalizeInsight(newInsight), ...prev]);
    };

    realtime.on('new-insight', onNewInsight);

    return () => {
      realtime.off('new-insight', onNewInsight);
    };
  }, []);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const [res, sheetRes] = await Promise.all([
        api.getInsights(),
        api.getSheetAnalysis().catch(() => ({ analyses: [] }))
      ]);
      
      // Transform sheet analysis results to match InsightCard format
      const transformedSheetAnalyses = (sheetRes.analyses || []).map(analysis => ({
        id: analysis.id,
        title: analysis.title,
        explanation: analysis.description,
        action: Array.isArray(parseMaybeJson(analysis.recommendations))
          ? parseMaybeJson(analysis.recommendations)[0]
          : 'Review analysis',
        urgency: normalizeScore(analysis.confidence_score || 0.5),
        confidence: normalizeScore(analysis.confidence_score || 0.5),
        type: analysis.analysis_type,
        metrics: analysis.metrics,
        category: analysis.analysis_type?.replace(/_/g, ' ')
      }));
      
      // Merge sheet analysis with regular insights
      const allInsights = [...(res.data || []), ...transformedSheetAnalyses].map(normalizeInsight);
      setInsights(allInsights);
    } catch (error) {
      console.error('Error fetching insights:', error);
      setInsights([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="insights-feed">
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          <Loader className="animate-spin" size={40} style={{ margin: '0 auto 20px' }} />
          <p>Loading insights...</p>
        </div>
      </div>
    );
  }

  const filteredInsights = filter === 'all' 
    ? insights 
    : insights.filter(insight => insight.category === filter || insight.type === filter);

  return (
    <div className="insights-feed">
      <div className="page-header">
        <h1>Insights Feed</h1>
        <p>AI-generated recommendations and actionable insights</p>
      </div>

      <div className="feed-controls">
        <div className="filter-buttons">
          <button 
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All Insights
          </button>
          <button 
            className={filter === 'pricing' ? 'active' : ''}
            onClick={() => setFilter('pricing')}
          >
            Pricing
          </button>
          <button 
            className={filter === 'reviews' ? 'active' : ''}
            onClick={() => setFilter('reviews')}
          >
            Reviews
          </button>
          <button 
            className={filter === 'competitors' ? 'active' : ''}
            onClick={() => setFilter('competitors')}
          >
            Competitors
          </button>
          <button 
            className={filter === 'logistics' ? 'active' : ''}
            onClick={() => setFilter('logistics')}
          >
            Logistics
          </button>
        </div>
        <div className="insights-count">
          {filteredInsights.length} insights
        </div>
      </div>

      {filteredInsights.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
          <p>No insights yet. Start by adding products and tracking competitors.</p>
        </div>
      ) : (
        <div className="insights-feed-grid">
          {filteredInsights.map((insight) => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      )}
    </div>
  );
};

export default InsightsFeed;
