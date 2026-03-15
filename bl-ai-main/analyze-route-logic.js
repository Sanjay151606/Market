// Reproduce the route finding logic to identify bugs

const testRoutes = [
  {
    routeName: 'Primary Route',
    distanceKm: 287.7,
    estimatedDurationHours: 4.31,
    averageSpeedKmph: 66.8,
    tollGates: 2
  },
  {
    routeName: 'Alternative Route 1',
    distanceKm: 295.2,
    estimatedDurationHours: 4.48,
    averageSpeedKmph: 65.9,
    tollGates: 1
  }
];

// Current implementation of buildRouteCost
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

// Current Dijkstra implementation
const selectRouteWithDijkstra = (routeOptions, options = {}) => {
  if (!Array.isArray(routeOptions) || routeOptions.length === 0) return null;

  const startNode = 'START';
  const endNode = 'END';
  const routeNodeIds = routeOptions.map((_, index) => `R${index}`);

  const adjacency = new Map();
  adjacency.set(startNode, []);
  adjacency.set(endNode, []);
  routeNodeIds.forEach((nodeId) => adjacency.set(nodeId, []));

  routeOptions.forEach((route, index) => {
    const nodeId = routeNodeIds[index];
    const weight = buildRouteCost(route, options);
    adjacency.get(startNode).push({ to: nodeId, weight });
    adjacency.get(nodeId).push({ to: endNode, weight: 0 });
  });

  const distances = new Map();
  const previous = new Map();
  const unvisited = new Set(adjacency.keys());

  adjacency.forEach((_, key) => distances.set(key, Infinity));
  distances.set(startNode, 0);

  while (unvisited.size > 0) {
    let current = null;
    let smallest = Infinity;

    unvisited.forEach((node) => {
      const candidate = distances.get(node);
      if (candidate < smallest) {
        smallest = candidate;
        current = node;
      }
    });

    if (current === null || smallest === Infinity) break;
    if (current === endNode) break;

    unvisited.delete(current);

    const neighbors = adjacency.get(current) || [];
    neighbors.forEach(({ to, weight }) => {
      if (!unvisited.has(to)) return;
      const alt = distances.get(current) + weight;
      if (alt < distances.get(to)) {
        distances.set(to, alt);
        previous.set(to, current);
      }
    });
  }

  let cursor = endNode;
  let selectedRouteNode = null;
  while (previous.has(cursor)) {
    const prevNode = previous.get(cursor);
    if (prevNode.startsWith('R')) {
      selectedRouteNode = prevNode;
      break;
    }
    cursor = prevNode;
  }

  if (!selectedRouteNode) return routeOptions[0];
  const selectedIndex = Number(selectedRouteNode.replace('R', ''));
  return routeOptions[selectedIndex] || routeOptions[0];
};

// Simpler alternative - just sort by cost
const selectRouteByCost = (routeOptions, options = {}) => {
  return [...routeOptions].sort((a, b) => {
    const costA = buildRouteCost(a, options);
    const costB = buildRouteCost(b, options);
    return costA - costB;
  })[0];
};

console.log('=== ANALYZING ROUTE SELECTION ===\n');

console.log('Test Routes:');
testRoutes.forEach((r, i) => {
  console.log(`${i}. ${r.routeName}: ${r.distanceKm} km, ${r.estimatedDurationHours} hrs, ${r.tollGates} tolls`);
});

console.log('\n--- Scenario 1: Normal routing (no avoidTollGates) ---');
const cost0 = buildRouteCost(testRoutes[0], { avoidTollGates: false });
const cost1 = buildRouteCost(testRoutes[1], { avoidTollGates: false });
console.log(`Route 0 cost: ${cost0}`);
console.log(`Route 1 cost: ${cost1}`);
console.log(`Dijkstra selects: ${selectRouteWithDijkstra(testRoutes, { avoidTollGates: false }).routeName}`);
console.log(`Cost sort selects: ${selectRouteByCost(testRoutes, { avoidTollGates: false }).routeName}`);

console.log('\n--- Scenario 2: Avoid toll gates ---');
const cost0_avoid = buildRouteCost(testRoutes[0], { avoidTollGates: true });
const cost1_avoid = buildRouteCost(testRoutes[1], { avoidTollGates: true });
console.log(`Route 0 cost: ${cost0_avoid}`);
console.log(`Route 1 cost: ${cost1_avoid}`);
console.log(`Dijkstra selects: ${selectRouteWithDijkstra(testRoutes, { avoidTollGates: true }).routeName}`);
console.log(`Cost sort selects: ${selectRouteByCost(testRoutes, { avoidTollGates: true }).routeName}`);

console.log('\n--- Scenario 3: Target duration 4 hours ---');
const cost0_target = buildRouteCost(testRoutes[0], { targetDurationHours: 4 });
const cost1_target = buildRouteCost(testRoutes[1], { targetDurationHours: 4 });
console.log(`Route 0 cost: ${cost0_target}`);
console.log(`Route 1 cost: ${cost1_target}`);
console.log(`Dijkstra selects: ${selectRouteWithDijkstra(testRoutes, { targetDurationHours: 4 }).routeName}`);
console.log(`Cost sort selects: ${selectRouteByCost(testRoutes, { targetDurationHours: 4 }).routeName}`);

console.log('\n=== ISSUES IDENTIFIED ===\n');
console.log('1. The cost function heavily weights ETA (×120) vs distance (×1)');
console.log('   - This means a 1 hour difference costs 120, but 1 km difference costs 1');
console.log('   - Small distance variations have minimal impact on route selection');
console.log('\n2. Dijkstra for this problem is overkill - simple sorting by cost works identically');
console.log('\n3. avoidTollGates penalty (×35) might not be strong enough to override ETA preference');
console.log('   - Route 1 (avoid toll) has +0.17 hrs but -1 toll');
console.log('   - Cost difference: ', Math.abs(cost0_avoid - cost1_avoid), ' (Route 1 cheaper when avoiding tolls)');
console.log('\n4. The primaryRoute selection (fastest) might not be ideal as standardRoute');
