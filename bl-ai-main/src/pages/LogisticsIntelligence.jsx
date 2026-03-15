import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Truck, TrendingDown, Award, Loader } from 'lucide-react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../utils/api';
import realtime from '../utils/realtime';
import InsightCard from '../components/InsightCard';
import './LogisticsIntelligence.css';

const RouteMapUpdater = ({ from, to, routeCoordinates }) => {
  const map = useMap();

  useEffect(() => {
    if (!from || !to || !map) return;

    try {
      const points = [
        [from.lat, from.lon],
        [to.lat, to.lon],
        ...(routeCoordinates || []).map(([lon, lat]) => [lat, lon])
      ];

      if (points.length >= 2) {
        map.fitBounds(points, { padding: [30, 30] });
      }
    } catch (err) {
      console.warn('Map fit bounds error:', err);
      // Fallback: just center on from location
      if (map && from) {
        map.setView([from.lat, from.lon], 7);
      }
    }
  }, [map, from, to, routeCoordinates]);

  return null;
};

const LogisticsIntelligence = () => {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState([]);
  const [costTrend, setCostTrend] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [transportForm, setTransportForm] = useState({
    fromPlace: '',
    toPlace: '',
    targetDurationHours: '',
    avoidTollGates: false
  });
  const [transportError, setTransportError] = useState('');
  const [optimizingRoute, setOptimizingRoute] = useState(false);
  const [optimizedRouteData, setOptimizedRouteData] = useState(null);
  const [loggingShipment, setLoggingShipment] = useState(false);
  const [shipmentForm, setShipmentForm] = useState({
    orderId: '',
    provider: '',
    route: '',
    weight: '',
    cost: '',
    estimatedDelivery: '',
    status: 'created'
  });

  useEffect(() => {
    fetchLogisticsData();

    const onLogisticsUpdate = () => {
      fetchLogisticsData();
    };

    realtime.on('logistics-update', onLogisticsUpdate);

    return () => {
      realtime.off('logistics-update', onLogisticsUpdate);
    };
  }, []);

  const fetchLogisticsData = async () => {
    try {
      setLoading(true);
      const res = await api.getLogisticsData();

      if (res.data) {
        setProviders(res.data.providers || []);
        setCostTrend(res.data.cost_trends || []);
        setRecommendations(res.data.recommendations || []);
      }
    } catch (error) {
      console.error('Error fetching logistics data:', error);
      setProviders([]);
      setCostTrend([]);
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleShipmentChange = (field, value) => {
    setShipmentForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleTransportChange = (field, value) => {
    setTransportForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleOptimizeRoute = async () => {
    if (!transportForm.fromPlace.trim() || !transportForm.toPlace.trim()) {
      setTransportError('Please enter both starting and destination places');
      return;
    }

    try {
      setOptimizingRoute(true);
      setTransportError('');
      console.log('🚚 Requesting route optimization:', {
        from: transportForm.fromPlace,
        to: transportForm.toPlace,
        targetDuration: transportForm.targetDurationHours,
        avoidTolls: transportForm.avoidTollGates
      });

      const response = await api.optimizeTransportRoute(
        transportForm.fromPlace.trim(),
        transportForm.toPlace.trim(),
        transportForm.targetDurationHours ? Number(transportForm.targetDurationHours) : undefined,
        transportForm.avoidTollGates
      );

      if (!response.data) {
        throw new Error('No route data returned');
      }

      console.log('✓ Route optimization successful:', response.data);
      setOptimizedRouteData(response.data);
    } catch (error) {
      console.error('Error optimizing route:', error);
      const errorMsg = error?.error || error?.message || error?.data?.error || 'Unable to optimize route. Please check your location names and try again.';
      setTransportError(errorMsg);
      setOptimizedRouteData(null);
    } finally {
      setOptimizingRoute(false);
    }
  };

  const handleLogShipment = async () => {
    if (!shipmentForm.orderId.trim() || !shipmentForm.provider.trim() || !shipmentForm.cost) {
      return;
    }

    try {
      setLoggingShipment(true);
      await api.logShipment({
        orderId: shipmentForm.orderId.trim(),
        provider: shipmentForm.provider.trim(),
        route: shipmentForm.route.trim() || undefined,
        weight: shipmentForm.weight ? Number(shipmentForm.weight) : undefined,
        cost: Number(shipmentForm.cost),
        estimatedDelivery: shipmentForm.estimatedDelivery || undefined,
        status: shipmentForm.status || 'created'
      });

      setShipmentForm({
        orderId: '',
        provider: '',
        route: '',
        weight: '',
        cost: '',
        estimatedDelivery: '',
        status: 'created'
      });

      await fetchLogisticsData();
    } catch (error) {
      console.error('Error logging shipment:', error);
    } finally {
      setLoggingShipment(false);
    }
  };

  if (loading) {
    return (
      <div className="logistics-intelligence">
        <div className="state-card">
          <Loader className="animate-spin" size={40} />
          <p>Loading logistics data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="logistics-intelligence">
      <div className="page-header">
        <h1>Logistics Intelligence</h1>
        <p>Optimize shipping costs and delivery performance</p>
      </div>

      <div className="transport-optimizer-card">
        <h2 className="section-title">Transport Optimizer</h2><br />

        <p className="transport-subtitle">Enter from/to places and target duration to get better distance + ETA. Toll gates are counted only.</p>

        <div className="transport-form-grid">
          <input
            type="text"
            placeholder="From place (e.g. Delhi)"
            value={transportForm.fromPlace}
            onChange={(e) => handleTransportChange('fromPlace', e.target.value)}
          />
          <input
            type="text"
            placeholder="To place (e.g. Jaipur)"
            value={transportForm.toPlace}
            onChange={(e) => handleTransportChange('toPlace', e.target.value)}
          />
          <input
            type="number"
            placeholder="Target duration (hours)"
            value={transportForm.targetDurationHours}
            onChange={(e) => handleTransportChange('targetDurationHours', e.target.value)}
          />
          <button
            className="optimize-btn"
            onClick={handleOptimizeRoute}
            disabled={optimizingRoute || !transportForm.fromPlace.trim() || !transportForm.toPlace.trim()}
          >
            {optimizingRoute ? 'Optimizing...' : 'Optimize Route'}
          </button>
        </div>

        <label className="transport-checkbox">
          <input
            type="checkbox"
            checked={transportForm.avoidTollGates}
            onChange={(e) => handleTransportChange('avoidTollGates', e.target.checked)}
          />
          <span>Without toll gate (prefer minimum toll route)</span>
        </label>

        {transportError && (
          <div className="transport-error">
            {transportError}
          </div>
        )}

        {optimizedRouteData?.optimizedRoute && (
          <div className="optimized-result">
            {(() => {
              // Ensure map fully refreshes when route result changes
              const mapKey = [
                optimizedRouteData?.fromPlace,
                optimizedRouteData?.toPlace,
                optimizedRouteData?.optimizedRoute?.routeName,
                optimizedRouteData?.optimizedRoute?.distanceKm,
                optimizedRouteData?.optimizedRoute?.estimatedDurationHours,
                optimizedRouteData?.optimizedRoute?.tollGates
              ].join('|');

              return (
                <>
            <div className="route-results-grid">
              <div className="result-panel">
                <h3>Standard Route</h3>
                <div className="optimized-metrics">
                  <div className="metric-chip"><span>Route</span><strong>{(optimizedRouteData.standardRoute || optimizedRouteData.optimizedRoute).routeName}</strong></div>
                  <div className="metric-chip"><span>Distance</span><strong>{(optimizedRouteData.standardRoute || optimizedRouteData.optimizedRoute).distanceKm} km</strong></div>
                  <div className="metric-chip"><span>ETA</span><strong>{(optimizedRouteData.standardRoute || optimizedRouteData.optimizedRoute).estimatedDurationHours} hrs</strong></div>
                  <div className="metric-chip"><span>Toll Gates</span><strong>{(optimizedRouteData.standardRoute || optimizedRouteData.optimizedRoute).tollGates}</strong></div>
                </div>
              </div>

              <div className="result-panel optimized">
                <h3>Optimized Route</h3>
                <div className="optimized-metrics">
                  <div className="metric-chip"><span>Route</span><strong>{optimizedRouteData.optimizedRoute.routeName}</strong></div>
                  <div className="metric-chip"><span>Distance</span><strong>{optimizedRouteData.optimizedRoute.distanceKm} km</strong></div>
                  <div className="metric-chip"><span>ETA</span><strong>{optimizedRouteData.optimizedRoute.estimatedDurationHours} hrs</strong></div>
                  <div className="metric-chip"><span>Toll Gates</span><strong>{optimizedRouteData.optimizedRoute.tollGates}</strong></div>
                </div>
              </div>
            </div>

            {optimizedRouteData?.comparison && (
              <div className="route-comparison-strip">
                <span>ETA Δ: {optimizedRouteData.comparison.etaDifferenceHours} hrs</span>
                <span>Distance Δ: {optimizedRouteData.comparison.distanceDifferenceKm} km</span>
                <span>Toll Gates Δ: {optimizedRouteData.comparison.tollGateDifference}</span>
              </div>
            )}

            <div className="map-legend-mini">
              <span><i className="legend-line standard" /> Standard</span>
              <span><i className="legend-line optimized" /> Optimized</span>
            </div>

            {optimizedRouteData?.map?.optimizedRouteGeometry?.coordinates?.length > 0 && (
              <div className="route-map-wrap">
                <MapContainer
                  key={mapKey}
                  center={[
                    optimizedRouteData.map.from.lat,
                    optimizedRouteData.map.from.lon
                  ]}
                  zoom={7}
                  style={{ height: '320px', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <RouteMapUpdater
                    from={optimizedRouteData.map.from}
                    to={optimizedRouteData.map.to}
                    routeCoordinates={optimizedRouteData.map.optimizedRouteGeometry.coordinates}
                  />
                  {optimizedRouteData?.map?.standardRouteGeometry?.coordinates?.length > 0 && (
                    <Polyline
                      positions={optimizedRouteData.map.standardRouteGeometry.coordinates.map(([lon, lat]) => [lat, lon])}
                      pathOptions={{ color: '#64748b', weight: 4, dashArray: '8 8' }}
                    />
                  )}
                  <Polyline
                    positions={optimizedRouteData.map.optimizedRouteGeometry.coordinates.map(([lon, lat]) => [lat, lon])}
                    pathOptions={{ color: '#4f46e5', weight: 5 }}
                  />
                  <CircleMarker center={[optimizedRouteData.map.from.lat, optimizedRouteData.map.from.lon]} radius={7} pathOptions={{ color: '#16a34a' }}>
                    <Popup>From: {optimizedRouteData.fromPlace}</Popup>
                  </CircleMarker>
                  <CircleMarker center={[optimizedRouteData.map.to.lat, optimizedRouteData.map.to.lon]} radius={7} pathOptions={{ color: '#dc2626' }}>
                    <Popup>To: {optimizedRouteData.toPlace}</Popup>
                  </CircleMarker>
                </MapContainer>
              </div>
            )}

            <div className="detailed-solution">
              <h3>Detailed Transport Solution</h3>
              <ul>
                {(optimizedRouteData.detailedSolution || []).map((item, index) => (
                  <li key={`detail-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {providers.length === 0 ? (
        <div className="state-card">
          <p>No logistics data available yet.</p>
          <p className="state-subtitle">Log your first shipment to start real-time logistics intelligence.</p>
          <div className="shipment-form-card">
            <div className="shipment-grid three">
              <input
                type="text"
                placeholder="Order ID *"
                value={shipmentForm.orderId}
                onChange={(e) => handleShipmentChange('orderId', e.target.value)}
              />
              <input
                type="text"
                placeholder="Provider * (e.g. Delhivery)"
                value={shipmentForm.provider}
                onChange={(e) => handleShipmentChange('provider', e.target.value)}
              />
              <input
                type="number"
                placeholder="Cost *"
                value={shipmentForm.cost}
                onChange={(e) => handleShipmentChange('cost', e.target.value)}
              />
            </div>
            <div className="shipment-grid four">
              <input
                type="text"
                placeholder="Route (optional)"
                value={shipmentForm.route}
                onChange={(e) => handleShipmentChange('route', e.target.value)}
              />
              <input
                type="number"
                step="0.1"
                placeholder="Weight (kg)"
                value={shipmentForm.weight}
                onChange={(e) => handleShipmentChange('weight', e.target.value)}
              />
              <input
                type="date"
                value={shipmentForm.estimatedDelivery}
                onChange={(e) => handleShipmentChange('estimatedDelivery', e.target.value)}
              />
              <select
                value={shipmentForm.status}
                onChange={(e) => handleShipmentChange('status', e.target.value)}
              >
                <option value="created">Created</option>
                <option value="in_transit">In Transit</option>
                <option value="delivered">Delivered</option>
                <option value="delayed">Delayed</option>
              </select>
            </div>
            <button
              className="log-shipment-btn"
              onClick={handleLogShipment}
              disabled={loggingShipment || !shipmentForm.orderId.trim() || !shipmentForm.provider.trim() || !shipmentForm.cost}
            >
              {loggingShipment ? 'Logging Shipment...' : 'Log First Shipment'}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="provider-comparison">
            <h2 className="section-title">Provider Cost Comparison</h2>
            <div className="comparison-table">
              <div className="table-header">
                <div>Provider</div>
                <div>Zone 1</div>
                <div>Zone 2</div>
                <div>Zone 3</div>
                <div>Rating</div>
                <div>Avg Delivery</div>
              </div>
              {providers.map((provider) => (
                <div key={provider.id} className="table-row">
                  <div className="provider-name">
                    <div className="provider-icon">
                      <Truck size={16} />
                    </div>
                    {provider.name}
                  </div>
                  <div className="cost-cell">₹{provider.zone1_cost || 0}</div>
                  <div className="cost-cell">₹{provider.zone2_cost || 0}</div>
                  <div className="cost-cell">₹{provider.zone3_cost || 0}</div>
                  <div className="rating-cell">
                    ⭐ {provider.rating || 0}
                  </div>
                  <div className="time-cell">{provider.avg_delivery_time || 'N/A'}</div>
                </div>
              ))}
            </div>
          </div>

          {costTrend.length > 0 && (
            <div className="chart-card">
              <h3 className="chart-title">Weekly Logistics Cost Trends</h3>
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={costTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" stroke="#64748b" />
                  <YAxis stroke="#64748b" />
                  <Tooltip />
                  <Legend />
                  {Object.keys(costTrend[0] || {})
                    .filter(key => key !== 'week')
                    .map((provider) => (
                      <Line
                        key={provider}
                        type="monotone"
                        dataKey={provider}
                        stroke={['#6366f1', '#10b981', '#f59e0b'][Object.keys(costTrend[0]).indexOf(provider) - 1]}
                        strokeWidth={2}
                      />
                    ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {recommendations.length > 0 && (
            <div className="recommendations-section">
              <h2 className="section-title">Cost Optimization Recommendations</h2>
              <div className="recommendations-grid">
                {recommendations.map((rec) => (
                  <InsightCard
                    key={`logistics-rec-${rec.id || Math.random()}`}
                    insight={{
                      title: rec.title,
                      type: 'logistics_optimization',
                      urgency_score: rec.impact === 'high' ? 90 : 60,
                      confidence: rec.confidence || 85,
                      explanation: rec.description,
                      action: `Implement to save ${rec.potential_savings}`
                    }}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default LogisticsIntelligence;
