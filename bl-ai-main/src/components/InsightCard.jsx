import { ThumbsUp, ThumbsDown, AlertCircle, TrendingUp } from 'lucide-react';
import './InsightCard.css';

const InsightCard = ({ insight }) => {
  const getUrgencyColor = (urgency) => {
    if (urgency >= 80) return '#ef4444';
    if (urgency >= 50) return '#f59e0b';
    return '#10b981';
  };

  return (
    <div className="insight-card">
      <div className="insight-header">
        <div className="insight-icon">
          <TrendingUp size={18} />
        </div>
        <div className="insight-badges">
          <span className="urgency-badge" style={{ background: `${getUrgencyColor(insight.urgency)}15`, color: getUrgencyColor(insight.urgency) }}>
            Urgency: {insight.urgency}%
          </span>
          <span className="confidence-badge">
            Confidence: {insight.confidence}%
          </span>
        </div>
      </div>
      <h3 className="insight-title">{insight.title}</h3>
      <p className="insight-explanation">{insight.explanation}</p>
      <div className="insight-action">
        <AlertCircle size={16} />
        <span>{insight.action}</span>
      </div>
      <div className="insight-footer">
        <button className="feedback-btn helpful">
          <ThumbsUp size={16} />
          Helpful
        </button>
        <button className="feedback-btn not-helpful">
          <ThumbsDown size={16} />
          Not Helpful
        </button>
      </div>
    </div>
  );
};

export default InsightCard;
