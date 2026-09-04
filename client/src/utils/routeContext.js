const MAJOR_US_METROS = [
  { city: 'Albuquerque', state: 'NM', lat: 35.0844, lng: -106.6504 },
  { city: 'Atlanta', state: 'GA', lat: 33.749, lng: -84.388 },
  { city: 'Austin', state: 'TX', lat: 30.2672, lng: -97.7431 },
  { city: 'Baltimore', state: 'MD', lat: 39.2904, lng: -76.6122 },
  { city: 'Birmingham', state: 'AL', lat: 33.5186, lng: -86.8104 },
  { city: 'Boise', state: 'ID', lat: 43.615, lng: -116.2023 },
  { city: 'Boston', state: 'MA', lat: 42.3601, lng: -71.0589 },
  { city: 'Buffalo', state: 'NY', lat: 42.8864, lng: -78.8784 },
  { city: 'Charlotte', state: 'NC', lat: 35.2271, lng: -80.8431 },
  { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
  { city: 'Cincinnati', state: 'OH', lat: 39.1031, lng: -84.512 },
  { city: 'Cleveland', state: 'OH', lat: 41.4993, lng: -81.6944 },
  { city: 'Columbus', state: 'OH', lat: 39.9612, lng: -82.9988 },
  { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.797 },
  { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
  { city: 'Des Moines', state: 'IA', lat: 41.5868, lng: -93.625 },
  { city: 'Detroit', state: 'MI', lat: 42.3314, lng: -83.0458 },
  { city: 'El Paso', state: 'TX', lat: 31.7619, lng: -106.485 },
  { city: 'Fresno', state: 'CA', lat: 36.7378, lng: -119.7871 },
  { city: 'Houston', state: 'TX', lat: 29.7604, lng: -95.3698 },
  { city: 'Indianapolis', state: 'IN', lat: 39.7684, lng: -86.1581 },
  { city: 'Jacksonville', state: 'FL', lat: 30.3322, lng: -81.6557 },
  { city: 'Kansas City', state: 'MO', lat: 39.0997, lng: -94.5786 },
  { city: 'Knoxville', state: 'TN', lat: 35.9606, lng: -83.9207 },
  { city: 'Las Vegas', state: 'NV', lat: 36.1699, lng: -115.1398 },
  { city: 'Little Rock', state: 'AR', lat: 34.7465, lng: -92.2896 },
  { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
  { city: 'Louisville', state: 'KY', lat: 38.2527, lng: -85.7585 },
  { city: 'Memphis', state: 'TN', lat: 35.1495, lng: -90.049 },
  { city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
  { city: 'Milwaukee', state: 'WI', lat: 43.0389, lng: -87.9065 },
  { city: 'Minneapolis', state: 'MN', lat: 44.9778, lng: -93.265 },
  { city: 'Nashville', state: 'TN', lat: 36.1627, lng: -86.7816 },
  { city: 'New Orleans', state: 'LA', lat: 29.9511, lng: -90.0715 },
  { city: 'New York', state: 'NY', lat: 40.7128, lng: -74.006 },
  { city: 'Norfolk', state: 'VA', lat: 36.8508, lng: -76.2859 },
  { city: 'Oklahoma City', state: 'OK', lat: 35.4676, lng: -97.5164 },
  { city: 'Omaha', state: 'NE', lat: 41.2565, lng: -95.9345 },
  { city: 'Orlando', state: 'FL', lat: 28.5383, lng: -81.3792 },
  { city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652 },
  { city: 'Phoenix', state: 'AZ', lat: 33.4484, lng: -112.074 },
  { city: 'Pittsburgh', state: 'PA', lat: 40.4406, lng: -79.9959 },
  { city: 'Portland', state: 'OR', lat: 45.5152, lng: -122.6784 },
  { city: 'Raleigh', state: 'NC', lat: 35.7796, lng: -78.6382 },
  { city: 'Richmond', state: 'VA', lat: 37.5407, lng: -77.436 },
  { city: 'Sacramento', state: 'CA', lat: 38.5816, lng: -121.4944 },
  { city: 'Salt Lake City', state: 'UT', lat: 40.7608, lng: -111.891 },
  { city: 'San Antonio', state: 'TX', lat: 29.4241, lng: -98.4936 },
  { city: 'San Diego', state: 'CA', lat: 32.7157, lng: -117.1611 },
  { city: 'San Francisco', state: 'CA', lat: 37.7749, lng: -122.4194 },
  { city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
  { city: 'St. Louis', state: 'MO', lat: 38.627, lng: -90.1994 },
  { city: 'Tampa', state: 'FL', lat: 27.9506, lng: -82.4572 },
  { city: 'Tucson', state: 'AZ', lat: 32.2226, lng: -110.9747 },
  { city: 'Tulsa', state: 'OK', lat: 36.154, lng: -95.9928 },
  { city: 'Washington', state: 'DC', lat: 38.9072, lng: -77.0369 }
];

function toRadians(value) {
  return Number(value) * Math.PI / 180;
}

export function distanceMiles(from, to) {
  if (!from || !to) return null;
  const fromLat = Number(from.lat);
  const fromLng = Number(from.lng);
  const toLat = Number(to.lat);
  const toLng = Number(to.lng);
  if (![fromLat, fromLng, toLat, toLng].every(Number.isFinite)) return null;

  const earthRadiusMiles = 3958.8;
  const latitudeDelta = toRadians(toLat - fromLat);
  const longitudeDelta = toRadians(toLng - fromLng);
  const latitudeOne = toRadians(fromLat);
  const latitudeTwo = toRadians(toLat);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeOne) * Math.cos(latitudeTwo) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function findNearbyMajorCities(point, limit) {
  const count = Math.max(1, Number(limit) || 3);
  if (!point) return [];
  return MAJOR_US_METROS
    .map(function(metro) {
      return { ...metro, distanceMiles: distanceMiles(point, metro) };
    })
    .filter(function(metro) { return metro.distanceMiles != null; })
    .sort(function(a, b) { return a.distanceMiles - b.distanceMiles; })
    .slice(0, count);
}

export function uniqueMetroMarkers(pickupMetros, deliveryMetros) {
  const byName = new Map();
  [...(pickupMetros || []), ...(deliveryMetros || [])].forEach(function(metro) {
    const key = metro.city + '|' + metro.state;
    if (!byName.has(key)) byName.set(key, metro);
  });
  return Array.from(byName.values());
}

export { MAJOR_US_METROS };
