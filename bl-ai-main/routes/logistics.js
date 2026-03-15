import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { verifyToken } from '../utils/auth.js';
import { getLogisticsData } from '../utils/db.js';

const router = express.Router();

const fallbackCityCoordinates = {
  delhi: { lat: 28.6139, lon: 77.2090, display_name: 'Delhi, India' },
  mumbai: { lat: 19.0760, lon: 72.8777, display_name: 'Mumbai, India' },
  bengaluru: { lat: 12.9716, lon: 77.5946, display_name: 'Bengaluru, India' },
  bangalore: { lat: 12.9716, lon: 77.5946, display_name: 'Bengaluru, India' },
  chennai: { lat: 13.0827, lon: 80.2707, display_name: 'Chennai, India' },
  hyderabad: { lat: 17.3850, lon: 78.4867, display_name: 'Hyderabad, India' },
  kolkata: { lat: 22.5726, lon: 88.3639, display_name: 'Kolkata, India' },
  pune: { lat: 18.5204, lon: 73.8567, display_name: 'Pune, India' },
  jaipur: { lat: 26.9124, lon: 75.7873, display_name: 'Jaipur, India' }
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
};

const fetchWithRetry = async (url, options = {}, timeoutMs = 12000, maxRetries = 2) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const delay = attempt > 0 ? Math.min(1000 * Math.pow(2, attempt - 1), 5000) : 0;
      if (delay > 0) await new Promise(r => setTimeout(r, delay));
      
      const response = await fetchWithTimeout(url, options, timeoutMs);
      if (response.ok) return response;
      if (response.status !== 429 && response.status !== 503) return response; // Don't retry non-rate-limit errors
    } catch (error) {
      if (attempt === maxRetries) throw error;
      console.warn(`Attempt ${attempt + 1} failed, retrying...`, error.message);
    }
  }
};

const toRadians = (deg) => (deg * Math.PI) / 180;

const haversineKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const geocodePlace = async (place) => {
  const fallback = fallbackCityCoordinates[place.toLowerCase().trim()];

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`;
    const response = await fetchWithTimeout(url, {
      headers: {
        'User-Agent': 'MarketMindAI/1.0 (logistics optimizer)',
        'Accept-Language': 'en'
      }
    }, 12000);

    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          lat: Number(data[0].lat),
          lon: Number(data[0].lon),
          displayName: data[0].display_name
        };
      }
    }
  } catch (error) {
    console.warn('Primary geocode failed:', error.message);
  }

  if (fallback) {
    return {
      lat: fallback.lat,
      lon: fallback.lon,
      displayName: fallback.display_name
    };
  }

  throw new Error(`Could not locate place: ${place}. Try a major city name.`);
};

const fetchRouteOptions = async (fromCoord, toCoord) => {
  const endpoints = [
    'https://router.project-osrm.org',
    'https://routing.openstreetmap.de/routed-car'
  ];

  for (const base of endpoints) {
    try {
      const url = `${base}/route/v1/driving/${fromCoord.lon},${fromCoord.lat};${toCoord.lon},${toCoord.lat}?overview=full&geometries=geojson&alternatives=true&steps=true`;
      const response = await fetchWithTimeout(url, {}, 15000);
      if (!response.ok) continue;

      const data = await response.json();
      if (Array.isArray(data.routes) && data.routes.length > 0) {
        return data.routes;
      }
    } catch (error) {
      console.warn('Route provider failed:', base, error.message);
    }
  }

  throw new Error('Failed to fetch real route from routing providers. Please try again.');
};

const fetchTollBoothsInBbox = async (bbox) => {
  const query = `[out:json][timeout:25];node["barrier"="toll_booth"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});out;`;
  
  try {
    const response = await fetchWithRetry('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`
    }, 10000, 1); // 1 retry for toll booths

    if (!response.ok) {
      console.warn(`Overpass API returned ${response.status}, using fallback toll count`);
      return [];
    }

    const data = await response.json();
    if (data.elements && Array.isArray(data.elements)) {
      const booths = data.elements.map((item) => ({ lat: item.lat, lon: item.lon }));
      console.log(`✓ Fetched ${booths.length} toll booths from Overpass API`);
      return booths;
    }
    return [];
  } catch (error) {
    console.warn(`Toll booth lookup failed (${error.message}) - will use fallback toll counting`);
    return [];
  }
};

const computeRouteBbox = (coordinates) => {
  const lons = coordinates.map((coord) => coord[0]);
  const lats = coordinates.map((coord) => coord[1]);
  const margin = 0.25;
  return {
    south: Math.min(...lats) - margin,
    north: Math.max(...lats) + margin,
    west: Math.min(...lons) - margin,
    east: Math.max(...lons) + margin
  };
};

const countTollBoothsNearRoute = (routeCoordinates, tollBooths) => {
  if (!routeCoordinates?.length || !tollBooths?.length) return 0;

  const dedupeThresholdKm = 0.25;
  const dedupedBooths = [];

  tollBooths.forEach((booth) => {
    const alreadyGrouped = dedupedBooths.some((existing) =>
      haversineKm(existing.lat, existing.lon, booth.lat, booth.lon) <= dedupeThresholdKm
    );
    if (!alreadyGrouped) {
      dedupedBooths.push(booth);
    }
  });

  const thresholdKm = 0.35;
  let count = 0;
  dedupedBooths.forEach((booth) => {
    const near = routeCoordinates.some((coord) => {
      const [lon, lat] = coord;
      return haversineKm(lat, lon, booth.lat, booth.lon) <= thresholdKm;
    });
    if (near) count += 1;
  });

  return count;
};

const buildRouteCost = (route, options = {}) => {
  const {
    avoidTollGates = false,
    targetDurationHours = 0,
    maxAcceptableDuration = null,
    maxAcceptableDistance = null
  } = options;

  let cost = route.estimatedDurationHours * 120 + route.distanceKm;

  cost += avoidTollGates ? route.tollGates * 35 : route.tollGates * 5;

  if (targetDurationHours > 0 && route.estimatedDurationHours > targetDurationHours) {
    cost += (route.estimatedDurationHours - targetDurationHours) * 250;
  }

  if (maxAcceptableDuration && route.estimatedDurationHours > maxAcceptableDuration) {
    cost += (route.estimatedDurationHours - maxAcceptableDuration) * 400;
  }

  if (maxAcceptableDistance && route.distanceKm > maxAcceptableDistance) {
    cost += (route.distanceKm - maxAcceptableDistance) * 8;
  }

  return Number(cost.toFixed(3));
};

const selectBestRoute = (routeOptions, options = {}) => {
  // Simply select the route with minimum cost score
  // This is clearer than Dijkstra for this simple problem
  if (!Array.isArray(routeOptions) || routeOptions.length === 0) {
    return null;
  }

  let bestRoute = routeOptions[0];
  let bestCost = buildRouteCost(bestRoute, options);

  for (let i = 1; i < routeOptions.length; i++) {
    const currentCost = buildRouteCost(routeOptions[i], options);
    if (currentCost < bestCost) {
      bestCost = currentCost;
      bestRoute = routeOptions[i];
    }
  }

  return bestRoute;
};

// Transport optimization: From place -> To place -> optimized route details
router.post('/transport/optimize', verifyToken, async (req, res) => {
  try {
    const { fromPlace, toPlace, targetDurationHours, avoidTollGates = false } = req.body;

    if (!fromPlace || !toPlace) {
      return res.status(400).json({ success: false, error: 'fromPlace and toPlace are required' });
    }

    console.log(`\n🚚 Optimizing route: ${fromPlace} → ${toPlace}`);
    console.log(`   Target duration: ${targetDurationHours || 'any'} hours, Avoid tolls: ${avoidTollGates}`);

    let fromCoord, toCoord;
    try {
      fromCoord = await geocodePlace(fromPlace);
      toCoord = await geocodePlace(toPlace);
      console.log(`   From: ${fromCoord.displayName} [${fromCoord.lat.toFixed(3)}, ${fromCoord.lon.toFixed(3)}]`);
      console.log(`   To: ${toCoord.displayName} [${toCoord.lat.toFixed(3)}, ${toCoord.lon.toFixed(3)}]`);
    } catch (geocodeError) {
      return res.status(400).json({ success: false, error: geocodeError.message });
    }

    let osrmRoutes = [];
    try {
      osrmRoutes = await fetchRouteOptions(fromCoord, toCoord);
      console.log(`   ✓ Got ${osrmRoutes.length} route(s) from OSRM`);
    } catch (routeError) {
      console.warn(`   ⚠ Route provider failed: ${routeError.message}, using fallback`);
      const directDistance = haversineKm(fromCoord.lat, fromCoord.lon, toCoord.lat, toCoord.lon);
      const roadDistance = Number((directDistance * 1.2).toFixed(1));
      const durationHours = Number((roadDistance / 52).toFixed(2));

      osrmRoutes = [{
        distance: roadDistance * 1000,
        duration: durationHours * 3600,
        geometry: {
          type: 'LineString',
          coordinates: [
            [fromCoord.lon, fromCoord.lat],
            [toCoord.lon, toCoord.lat]
          ]
        },
        fallback: true
      }];
      console.log(`   ✓ Using fallback route: ${roadDistance} km, ${durationHours} hrs`);
    }

    if (!osrmRoutes || osrmRoutes.length === 0) {
      return res.status(500).json({ 
        success: false, 
        error: 'Unable to generate routes. Please try again.' 
      });
    }

    const bbox = computeRouteBbox(osrmRoutes[0].geometry?.coordinates || []);
    const tollBooths = await fetchTollBoothsInBbox(bbox);
    console.log(`   ✓ Checked toll booths (found ${tollBooths.length} potential booths)`);

    const routeOptions = osrmRoutes.map((route, index) => {
      const tollGates = countTollBoothsNearRoute(route.geometry?.coordinates || [], tollBooths);
      const durationHours = route.duration / 3600;
      const distanceKm = route.distance / 1000;

      return {
        routeName: index === 0 ? 'Primary Route' : `Alternative Route ${index}`,
        distanceKm: Number(distanceKm.toFixed(1)),
        estimatedDurationHours: Number(durationHours.toFixed(2)),
        averageSpeedKmph: Number((distanceKm / durationHours).toFixed(1)),
        tollGates,
        notes: index === 0 ? 'Recommended by routing engine' : 'Alternate based on traffic/path',
        geometry: route.geometry
      };
    });

    if (routeOptions.length === 0) {
      return res.status(500).json({ 
        success: false, 
        error: 'No valid routes found.' 
      });
    }

    const fastestRoute = [...routeOptions].sort((a, b) => a.estimatedDurationHours - b.estimatedDurationHours)[0];
    const standardRoute = fastestRoute;

    const target = Number(targetDurationHours || 0);
    let optimizedRoute = fastestRoute;
    if (target > 0) {
      const withinTarget = routeOptions
        .filter((option) => option.estimatedDurationHours <= target);
      if (withinTarget.length > 0) {
        optimizedRoute = selectBestRoute(withinTarget, {
          avoidTollGates,
          targetDurationHours: target
        });
      } else {
        optimizedRoute = selectBestRoute(routeOptions, {
          avoidTollGates,
          targetDurationHours: target
        });
      }
    } else if (avoidTollGates) {
      const maxAcceptableDuration = fastestRoute.estimatedDurationHours * 1.2;
      const maxAcceptableDistance = fastestRoute.distanceKm * 1.25;

      const practicalCandidates = routeOptions.filter((option) =>
        option.estimatedDurationHours <= maxAcceptableDuration &&
        option.distanceKm <= maxAcceptableDistance
      );

      const candidatePool = practicalCandidates.length > 0 ? practicalCandidates : routeOptions;
      optimizedRoute = selectBestRoute(candidatePool, {
        avoidTollGates: true,
        maxAcceptableDuration,
        maxAcceptableDistance
      });

      if (optimizedRoute.estimatedDurationHours > maxAcceptableDuration * 1.1) {
        optimizedRoute = fastestRoute;
      }
    }

    console.log(`   ✓ Standard route: ${standardRoute.routeName} (${standardRoute.distanceKm} km, ${standardRoute.estimatedDurationHours} hrs, ${standardRoute.tollGates} tolls)`);
    console.log(`   ✓ Optimized route: ${optimizedRoute.routeName} (${optimizedRoute.distanceKm} km, ${optimizedRoute.estimatedDurationHours} hrs, ${optimizedRoute.tollGates} tolls)`);

    const comparison = {
      etaDifferenceHours: Number((optimizedRoute.estimatedDurationHours - standardRoute.estimatedDurationHours).toFixed(2)),
      distanceDifferenceKm: Number((optimizedRoute.distanceKm - standardRoute.distanceKm).toFixed(1)),
      tollGateDifference: Number(optimizedRoute.tollGates - standardRoute.tollGates)
    };

    const detailedSolution = [
      `Start point resolved: ${fromCoord.displayName}.`,
      `Destination resolved: ${toCoord.displayName}.`,
      `Standard route: ${standardRoute.routeName} | ${standardRoute.distanceKm} km | ${standardRoute.estimatedDurationHours} hrs | toll gates ${standardRoute.tollGates}.`,
      `Optimized route: ${optimizedRoute.routeName} | ${optimizedRoute.distanceKm} km | ${optimizedRoute.estimatedDurationHours} hrs | toll gates ${optimizedRoute.tollGates}.`,
      avoidTollGates
        ? 'Route preference applied: minimum toll route selected without taking unrealistic detours.'
        : 'Route preference applied: fastest practical route.'
    ];

    res.json({
      success: true,
      data: {
        fromPlace,
        toPlace,
        avoidTollGates: Boolean(avoidTollGates),
        targetDurationHours: target > 0 ? target : null,
        standardRoute,
        optimizedRoute,
        comparison,
        alternatives: routeOptions.map((option) => ({
          routeName: option.routeName,
          distanceKm: option.distanceKm,
          estimatedDurationHours: option.estimatedDurationHours,
          tollGates: option.tollGates,
          notes: option.notes
        })),
        map: {
          from: { lat: fromCoord.lat, lon: fromCoord.lon },
          to: { lat: toCoord.lat, lon: toCoord.lon },
          standardRouteGeometry: standardRoute.geometry,
          optimizedRouteGeometry: optimizedRoute.geometry,
          routeGeometry: optimizedRoute.geometry
        },
        detailedSolution
      }
    });
  } catch (error) {
    console.error(`❌ Route optimization failed: ${error.message}`, error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Unable to optimize route. Please check your location names and try again.'
    });
  }
});

// Get logistics data
router.get('/', verifyToken, async (req, res) => {
  try {
    const logs = await getLogisticsData(req.user.userId);
    const normalizedLogs = (logs || []).filter((log) => Number(log.cost || 0) > 0);

    const zoneFromLog = (log) => {
      const route = (log.route || '').toLowerCase();
      if (route.includes('zone 1') || route.includes('zone1')) return 'zone1';
      if (route.includes('zone 2') || route.includes('zone2')) return 'zone2';
      if (route.includes('zone 3') || route.includes('zone3')) return 'zone3';
      const weight = Number(log.weight || 0);
      if (weight <= 0.5) return 'zone1';
      if (weight <= 2) return 'zone2';
      return 'zone3';
    };

    const providerMap = new Map();
    const trendMap = new Map();

    normalizedLogs.forEach((log) => {
      const providerName = log.provider || 'Unknown';
      const providerKey = providerName.toLowerCase();
      if (!providerMap.has(providerKey)) {
        providerMap.set(providerKey, {
          id: providerKey,
          name: providerName,
          zone1: [],
          zone2: [],
          zone3: [],
          delays: 0,
          count: 0,
          deliveryDays: []
        });
      }

      const provider = providerMap.get(providerKey);
      provider.count += 1;
      const cost = Number(log.cost || 0);
      const zone = zoneFromLog(log);
      provider[zone].push(cost);

      const status = (log.status || '').toLowerCase();
      if (status.includes('delay') || status.includes('late')) provider.delays += 1;

      if (log.estimated_delivery && log.created_at) {
        const created = new Date(log.created_at);
        const estimated = new Date(log.estimated_delivery);
        const days = (estimated - created) / (1000 * 60 * 60 * 24);
        if (Number.isFinite(days) && days >= 0) {
          provider.deliveryDays.push(days);
        }
      }

      const date = new Date(log.created_at);
      const weekLabel = `${date.getFullYear()}-W${Math.ceil((date.getDate() + 6 - date.getDay()) / 7)}`;
      if (!trendMap.has(weekLabel)) {
        trendMap.set(weekLabel, { week: weekLabel });
      }
      const weekEntry = trendMap.get(weekLabel);
      weekEntry[providerName] = (weekEntry[providerName] || 0) + cost;
    });

    const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

    const providers = Array.from(providerMap.values()).map((provider) => {
      const averageDelivery = avg(provider.deliveryDays);
      const delayRatio = provider.count > 0 ? provider.delays / provider.count : 0;
      const rating = Math.max(2.5, Math.min(5, 5 - (delayRatio * 2)));

      return {
        id: provider.id,
        name: provider.name,
        zone1_cost: Number(avg(provider.zone1).toFixed(2)),
        zone2_cost: Number(avg(provider.zone2).toFixed(2)),
        zone3_cost: Number(avg(provider.zone3).toFixed(2)),
        rating: Number(rating.toFixed(1)),
        avg_delivery_time: averageDelivery > 0 ? `${averageDelivery.toFixed(1)} Days` : 'N/A',
        avg_total_cost: Number(avg([...provider.zone1, ...provider.zone2, ...provider.zone3]).toFixed(2))
      };
    });

    const cost_trends = Array.from(trendMap.values())
      .sort((a, b) => a.week.localeCompare(b.week))
      .slice(-8);

    const recommendations = [];
    if (providers.length >= 2) {
      const sortedByCost = [...providers].sort((a, b) => a.avg_total_cost - b.avg_total_cost);
      const cheapest = sortedByCost[0];
      const expensive = sortedByCost[sortedByCost.length - 1];

      if (expensive.avg_total_cost > cheapest.avg_total_cost) {
        const diff = expensive.avg_total_cost - cheapest.avg_total_cost;
        recommendations.push({
          id: 'cost-switch',
          title: `Shift shipments from ${expensive.name} to ${cheapest.name}`,
          description: `${expensive.name} average cost is ₹${expensive.avg_total_cost.toFixed(0)} vs ₹${cheapest.avg_total_cost.toFixed(0)} for ${cheapest.name}.`,
          impact: diff > 20 ? 'high' : 'medium',
          potential_savings: `₹${(diff * 30).toFixed(0)}/month`,
          confidence: 88
        });
      }
    }

    const delayedProviders = providers.filter((provider) => provider.rating < 3.8);
    if (delayedProviders.length > 0) {
      recommendations.push({
        id: 'delivery-risk',
        title: 'Reduce delayed shipment risk',
        description: `Low delivery reliability detected for: ${delayedProviders.map((p) => p.name).join(', ')}. Consider rerouting high-priority orders.`,
        impact: 'medium',
        potential_savings: 'On-time delivery improvement',
        confidence: 82
      });
    }

    res.json({
      success: true,
      data: {
        providers,
        cost_trends,
        recommendations
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get logistics cost comparison
router.get('/comparison', verifyToken, async (req, res) => {
  try {
    const { days = 30, route } = req.query;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - parseInt(days));

    let query = supabaseAdmin
      .from('logistics_logs')
      .select('*')
      .eq('seller_id', req.user.userId)
      .gte('created_at', dateFrom.toISOString());

    if (route) query = query.eq('route', route);

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) throw error;

    // Aggregate by provider
    const providers = {};
    data?.forEach(log => {
      if (!providers[log.provider]) {
        providers[log.provider] = {
          totalCost: 0,
          totalShipments: 0,
          avgCost: 0,
          costTrend: []
        };
      }
      providers[log.provider].totalCost += log.cost;
      providers[log.provider].totalShipments += 1;
      providers[log.provider].costTrend.push({
        date: log.created_at,
        cost: log.cost
      });
    });

    // Calculate average costs
    Object.keys(providers).forEach(provider => {
      providers[provider].avgCost =
        providers[provider].totalCost / providers[provider].totalShipments;
    });

    res.json({
      success: true,
      data: providers
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Log shipment
router.post('/shipment/log', verifyToken, async (req, res) => {
  try {
    const {
      orderId,
      provider,
      route,
      weight,
      cost,
      estimatedDelivery,
      status
    } = req.body;

    if (!orderId || !provider || !cost) {
      return res.status(400).json({
        success: false,
        error: 'Order ID, provider, and cost required'
      });
    }

    const { data, error } = await supabaseAdmin
      .from('logistics_logs')
      .insert([{
        seller_id: req.user.userId,
        order_id: orderId,
        provider,
        route,
        weight,
        cost,
        estimated_delivery: estimatedDelivery,
        status,
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) throw error;

    const io = req.app.locals.io;
    io.to(`seller-${req.user.userId}`).emit('logistics-update', data[0]);

    res.json({
      success: true,
      message: 'Shipment logged',
      data: data[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get route analytics
router.get('/:route/analytics', verifyToken, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const dateFrom = new Date();
    dateFrom.setDate(dateFrom.getDate() - parseInt(days));

    const { data, error } = await supabaseAdmin
      .from('logistics_logs')
      .select('*')
      .eq('seller_id', req.user.userId)
      .eq('route', req.params.route)
      .gte('created_at', dateFrom.toISOString());

    if (error) throw error;

    const costs = data.map(log => log.cost);
    const avgCost = costs.reduce((a, b) => a + b, 0) / costs.length;
    const minCost = Math.min(...costs);
    const maxCost = Math.max(...costs);

    const providers = {};
    data.forEach(log => {
      if (!providers[log.provider]) {
        providers[log.provider] = 0;
      }
      providers[log.provider] += 1;
    });

    res.json({
      success: true,
      data: {
        totalShipments: data.length,
        averageCost: parseFloat(avgCost.toFixed(2)),
        minCost,
        maxCost,
        topProvider: Object.keys(providers).reduce((a, b) =>
          providers[a] > providers[b] ? a : b
        )
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;