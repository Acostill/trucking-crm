import { distanceMiles, findNearbyMajorCities, uniqueMetroMarkers } from './routeContext';

test('calculates a reasonable straight-line distance between Los Angeles and San Diego', function() {
  const distance = distanceMiles(
    { lat: 34.0522, lng: -118.2437 },
    { lat: 32.7157, lng: -117.1611 }
  );
  expect(distance).toBeGreaterThan(105);
  expect(distance).toBeLessThan(120);
});

test('returns the closest major metros in distance order', function() {
  const metros = findNearbyMajorCities({ lat: 36.5708, lng: -119.6121 }, 3);
  expect(metros).toHaveLength(3);
  expect(metros[0].city).toBe('Fresno');
  expect(metros[0].distanceMiles).toBeLessThan(metros[1].distanceMiles);
});

test('deduplicates a metro that is near both lane endpoints', function() {
  const shared = { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437, distanceMiles: 2 };
  const markers = uniqueMetroMarkers(
    [shared],
    [{ ...shared, distanceMiles: 18 }, { city: 'San Diego', state: 'CA', lat: 32.7157, lng: -117.1611, distanceMiles: 95 }]
  );
  expect(markers.map(function(metro) { return metro.city; })).toEqual(['Los Angeles', 'San Diego']);
});
