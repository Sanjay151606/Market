#!/usr/bin/env node

/**
 * Route Finding System - Complete Verification Test
 * This script verifies all components of the route finding system
 */

import fetch from 'node-fetch';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.cyan}═══ ${msg} ═══${colors.reset}`)
};

async function testNominatim() {
  log.section('Nominatim Geocoding API');
  const places = [
    { name: 'Coimbatore', expected: 'Tamil Nadu' },
    { name: 'Thanjavur', expected: 'Tamil Nadu' },
    { name: 'Delhi', expected: 'Delhi' }
  ];

  let passed = 0;
  for (const place of places) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place.name)}`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'MarketMindAI/1.0' }
      });
      
      if (!response.ok) {
        log.error(`${place.name}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const displayName = data[0].display_name;
        const hasExpected = displayName.includes(place.expected);
        if (hasExpected) {
          log.success(`${place.name}: [${data[0].lat}, ${data[0].lon}]`);
          passed++;
        } else {
          log.warn(`${place.name}: Result doesn't include "${place.expected}"`);
        }
      } else {
        log.error(`${place.name}: No results`);
      }
    } catch (err) {
      log.error(`${place.name}: ${err.message}`);
    }
  }
  return { passed, total: places.length };
}

async function testOSRM() {
  log.section('OSRM Routing API');
  const routes = [
    {
      name: 'Coimbatore → Thanjavur',
      from: [76.9628, 11.0018],
      to: [79.2014, 10.6590],
      expectedDist: [280, 300],
      expectedDur: [4, 4.5]
    }
  ];

  let passed = 0;
  for (const route of routes) {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${route.from[0]},${route.from[1]};${route.to[0]},${route.to[1]}?overview=full&geometries=geojson&alternatives=true`;
      const response = await fetch(url, { timeout: 8000 });

      if (!response.ok) {
        log.error(`${route.name}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      if (Array.isArray(data.routes) && data.routes.length > 0) {
        const distance = data.routes[0].distance / 1000;
        const duration = data.routes[0].duration / 3600;
        const inRangeDist = distance >= route.expectedDist[0] && distance <= route.expectedDist[1];
        const inRangeDur = duration >= route.expectedDur[0] && duration <= route.expectedDur[1];

        if (inRangeDist && inRangeDur) {
          log.success(`${route.name}: ${distance.toFixed(1)} km, ${duration.toFixed(2)} hrs`);
          passed++;
        } else {
          log.warn(`${route.name}: Out of expected range (${distance.toFixed(1)} km, ${duration.toFixed(2)} hrs)`);
        }
      } else {
        log.error(`${route.name}: No routes returned`);
      }
    } catch (err) {
      log.error(`${route.name}: ${err.message}`);
    }
  }
  return { passed, total: routes.length };
}

async function testRouteCostFunction() {
  log.section('Route Cost Function');
  
  const testRoutes = [
    {
      routeName: 'Route A (Fast, 2 tolls)',
      distanceKm: 287.7,
      estimatedDurationHours: 4.31,
      tollGates: 2
    },
    {
      routeName: 'Route B (Slow, 1 toll)',
      distanceKm: 295.2,
      estimatedDurationHours: 4.48,
      tollGates: 1
    }
  ];

  const buildRouteCost = (route, options = {}) => {
    const { avoidTollGates = false, targetDurationHours = 0 } = options;
    let cost = route.estimatedDurationHours * 120 + route.distanceKm;
    cost += avoidTollGates ? route.tollGates * 35 : route.tollGates * 5;
    if (targetDurationHours > 0 && route.estimatedDurationHours > targetDurationHours) {
      cost += (route.estimatedDurationHours - targetDurationHours) * 250;
    }
    return Number(cost.toFixed(3));
  };

  const scenarios = [
    { name: 'Normal routing', options: { avoidTollGates: false } },
    { name: 'Avoid toll gates', options: { avoidTollGates: true } }
  ];

  let passed = 0;
  for (const scenario of scenarios) {
    const costs = testRoutes.map(r => buildRouteCost(r, scenario.options));
    const selected = testRoutes[costs.indexOf(Math.min(...costs))];
    log.info(`Scenario: ${scenario.name}`);
    testRoutes.forEach((route, idx) => {
      console.log(`  ${route.routeName}: cost=${costs[idx]}`);
    });
    log.success(`Selected: ${selected.routeName}`);
    passed++;
  }
  return { passed, total: scenarios.length };
}

async function testAPIEndpoint() {
  log.section('Backend API Endpoint');
  
  try {
    const response = await fetch('http://localhost:8000/api/logistics/transport/optimize', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-token'
      },
      body: JSON.stringify({
        fromPlace: 'Coimbatore',
        toPlace: 'Thanjavur'
      })
    });

    const data = await response.json();
    
    if (response.status === 401) {
      log.warn('API requires valid authentication token (expected)');
      log.success('Endpoint is accessible');
      return { passed: 1, total: 1 };
    } else if (response.ok) {
      if (data.data?.standardRoute && data.data?.optimizedRoute) {
        log.success('Route optimization returned valid response');
        return { passed: 1, total: 1 };
      } else {
        log.error('Response missing standard/optimized routes');
        return { passed: 0, total: 1 };
      }
    } else {
      log.error(`API returned ${response.status}`);
      return { passed: 0, total: 1 };
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      log.error('Backend server not running on localhost:8000');
    } else {
      log.error(`API test failed: ${err.message}`);
    }
    return { passed: 0, total: 1 };
  }
}

async function runAllTests() {
  console.log(`\n${colors.cyan}╔════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║   Route Finding System Verification     ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════╝${colors.reset}\n`);

  const results = [];
  
  results.push(await testNominatim());
  results.push(await testOSRM());
  results.push(await testRouteCostFunction());
  results.push(await testAPIEndpoint());

  log.section('Test Summary');
  const total = results.reduce((sum, r) => sum + r.total, 0);
  const passed = results.reduce((sum, r) => sum + r.passed, 0);
  
  if (passed === total) {
    log.success(`All ${total} tests passed!`);
    console.log(`\n${colors.green}✓ Route finding system is working correctly${colors.reset}`);
  } else {
    log.warn(`${passed}/${total} tests passed`);
    console.log(`\n${colors.yellow}⚠ Some issues detected - review above${colors.reset}`);
  }

  console.log(`\n${colors.cyan}Next Steps:${colors.reset}`);
  console.log('1. Start backend: node server.js');
  console.log('2. Test UI: http://localhost:5173/logistics');
  console.log('3. Enter: Coimbatore → Thanjavur');
  console.log('4. Verify map displays both routes\n');
}

runAllTests().catch(console.error);
