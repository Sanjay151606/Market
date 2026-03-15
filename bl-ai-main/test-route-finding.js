import fetch from 'node-fetch';

const API_BASE = 'http://localhost:8000';

// Test 1: Test geocoding
const testGeocoding = async () => {
  console.log('\n=== TEST 1: Geocoding Places ===');
  const places = ['Coimbatore', 'Thanjavur', 'Chennai', 'Delhi', 'Mumbai'];
  
  for (const place of places) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'MarketMindAI/1.0 (logistics optimizer)'
        }
      });
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log(`✅ ${place}: [${data[0].lat}, ${data[0].lon}] - ${data[0].display_name}`);
      } else {
        console.log(`❌ ${place}: No result from Nominatim`);
      }
    } catch (err) {
      console.log(`❌ ${place}: Error - ${err.message}`);
    }
  }
};

// Test 2: Test OSRM routing
const testOSRMRouting = async () => {
  console.log('\n=== TEST 2: OSRM Route Finding ===');
  const coordinates = [
    { name: 'Coimbatore → Thanjavur', from: [76.9719, 11.0081], to: [79.1356, 10.7905] },
    { name: 'Chennai → Bangalore', from: [80.2707, 13.0827], to: [77.5946, 12.9716] }
  ];

  for (const route of coordinates) {
    try {
      const endpoints = [
        'https://router.project-osrm.org',
        'https://routing.openstreetmap.de/routed-car'
      ];

      let found = false;
      for (const base of endpoints) {
        try {
          const url = `${base}/route/v1/driving/${route.from[0]},${route.from[1]};${route.to[0]},${route.to[1]}?overview=full&geometries=geojson&alternatives=true&steps=true`;
          console.log(`   Trying ${base}...`);
          const response = await fetch(url, { timeout: 8000 });
          
          if (response.ok) {
            const data = await response.json();
            if (Array.isArray(data.routes) && data.routes.length > 0) {
              const primaryRoute = data.routes[0];
              const distance = primaryRoute.distance / 1000;
              const duration = primaryRoute.duration / 3600;
              console.log(`   ✅ ${route.name}: ${distance.toFixed(1)} km, ${duration.toFixed(2)} hrs`);
              console.log(`      Routes found: ${data.routes.length}, Geometry points: ${primaryRoute.geometry.coordinates.length}`);
              found = true;
              break;
            }
          }
        } catch (e) {
          // Try next provider
        }
      }

      if (!found) {
        console.log(`   ❌ ${route.name}: Could not get route from either provider`);
      }
    } catch (err) {
      console.log(`   ❌ ${route.name}: Error - ${err.message}`);
    }
  }
};

// Test 3: Test Overpass toll booth lookup
const testTollBooths = async () => {
  console.log('\n=== TEST 3: Overpass API Toll Booth Lookup ===');
  const bboxes = [
    { name: 'Coimbatore-Thanjavur', south: 10.5, north: 11.5, west: 76.5, east: 79.5 }
  ];

  for (const bbox of bboxes) {
    try {
      const query = `[out:json][timeout:25];node["barrier"="toll_booth"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});out;`;
      console.log(`   Searching: ${bbox.name}`);
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        timeout: 9000
      });

      if (response.ok) {
        const data = await response.json();
        const elements = data.elements || [];
        console.log(`   ✅ ${bbox.name}: Found ${elements.length} toll booths`);
        if (elements.length > 0) {
          elements.slice(0, 3).forEach((item, idx) => {
            console.log(`      ${idx + 1}. [${item.lat}, ${item.lon}]`);
          });
        }
      } else {
        console.log(`   ❌ ${bbox.name}: HTTP ${response.status}`);
      }
    } catch (err) {
      console.log(`   ❌ ${bbox.name}: Error - ${err.message}`);
    }
  }
};

// Test 4: Test actual API endpoint (requires token)
const testAPIEndpoint = async () => {
  console.log('\n=== TEST 4: Route Optimization API (local) ===');
  
  try {
    // First try without token to see if endpoint exists
    const response = await fetch(`${API_BASE}/api/logistics/transport/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromPlace: 'Coimbatore',
        toPlace: 'Thanjavur',
        targetDurationHours: 0,
        avoidTollGates: false
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.log(`   ⚠️  API returned: ${response.status} - ${data.error}`);
      console.log('       (This is expected without a valid token. Check server logs for actual execution)');
    } else {
      console.log(`   ✅ API Response received`);
      console.log(`      From: ${data.data?.fromPlace}`);
      console.log(`      To: ${data.data?.toPlace}`);
      console.log(`      Standard Route: ${data.data?.standardRoute?.distanceKm} km, ${data.data?.standardRoute?.estimatedDurationHours} hrs`);
      console.log(`      Optimized Route: ${data.data?.optimizedRoute?.distanceKm} km, ${data.data?.optimizedRoute?.estimatedDurationHours} hrs`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }
};

// Main runner
async function main() {
  console.log('🚀 Route Finding Verification Tests\n');
  
  try {
    await testGeocoding();
    await testOSRMRouting();
    await testTollBooths();
    await testAPIEndpoint();
    
    console.log('\n✅ All tests completed!');
    console.log('\nChecklist:');
    console.log('[ ] Geocoding works for major cities');
    console.log('[ ] OSRM returns routes with valid distance/duration');
    console.log('[ ] Overpass API returns toll booth data');
    console.log('[ ] API endpoint accessible (may need token)');
    
  } catch (err) {
    console.error('❌ Test suite error:', err);
  }
}

main();
