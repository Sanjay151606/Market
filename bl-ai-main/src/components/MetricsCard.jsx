import './MetricsCard.css';

const MetricsCard = ({ title, value, change, icon: Icon, color }) => {
  const hasValidChange = Number.isFinite(Number(change));
  const normalizedChange = hasValidChange ? Number(change) : 0;
  const isPositive = normalizedChange >= 0;
  
  return (
    <div className="metrics-card">
      <div className="metrics-header">
        <div className="metrics-icon" style={{ background: `${color}15`, color }}>
          <Icon size={20} />
        </div>
        {hasValidChange && (
          <span className={`metrics-change ${isPositive ? 'positive' : 'negative'}`}>
            {isPositive ? '+' : ''}{normalizedChange}%
          </span>
        )}
      </div>
      <h3 className="metrics-value">{value}</h3>
      <p className="metrics-title">{title}</p>
    </div>
  );
};

export default MetricsCard;
