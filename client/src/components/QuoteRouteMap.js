import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Building2, LoaderCircle, MapPin } from 'lucide-react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { findNearbyMajorCities, uniqueMetroMarkers } from '../utils/routeContext';

const DEFAULT_CENTER = [39.8283, -98.5795];
const geocodeCache = new Map();
let lastGeocodeRequestAt = 0;

function locationLabel(location) {
  const cityState = [location && location.city, location && location.state].filter(Boolean).join(', ');
  return [cityState, location && location.zip].filter(Boolean).join(' ') || 'Location pending';
}

function geocodeQuery(location) {
  return [location && location.city, location && location.state, location && location.zip, 'USA']
    .filter(Boolean)
    .join(', ');
}

async function geocodeLocation(location, signal) {
  const query = geocodeQuery(location);
  if (!query || query === 'USA') throw new Error('Location is incomplete');
  const cacheKey = query.toLowerCase();
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=' +
    encodeURIComponent(query) +
    '&email=support@trucking-crm.app';
  const waitMilliseconds = Math.max(0, 1100 - (Date.now() - lastGeocodeRequestAt));
  if (waitMilliseconds) {
    await new Promise(function(resolve, reject) {
      const timer = window.setTimeout(resolve, waitMilliseconds);
      signal.addEventListener('abort', function() {
        window.clearTimeout(timer);
        reject(new DOMException('Request aborted', 'AbortError'));
      }, { once: true });
    });
  }
  lastGeocodeRequestAt = Date.now();
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new Error('Map lookup is temporarily unavailable');
  const results = await response.json();
  if (!Array.isArray(results) || !results.length) throw new Error('Location could not be found');
  const point = { lat: Number(results[0].lat), lng: Number(results[0].lon) };
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) {
    throw new Error('Location coordinates are invalid');
  }
  geocodeCache.set(cacheKey, point);
  return point;
}

function FitRoute({ points }) {
  const map = useMap();
  const signature = points.map(function(point) { return point[0] + ',' + point[1]; }).join('|');

  useEffect(function() {
    if (!points.length) return;
    if (points.length === 1 || (points[0][0] === points[1][0] && points[0][1] === points[1][1])) {
      map.setView(points[0], 9);
      return;
    }
    map.fitBounds(points, { padding: [42, 42], maxZoom: 8 });
  }, [map, signature]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

function MetroList({ label, location, metros, tone }) {
  return (
    <div className={'eq-route-metro-group ' + tone}>
      <div className="eq-route-metro-heading">
        <span>{label}</span>
        <strong>{locationLabel(location)}</strong>
      </div>
      <div className="eq-route-metro-list">
        {metros.map(function(metro) {
          return (
            <div className="eq-route-metro" key={metro.city + metro.state}>
              <Building2 size={14} />
              <span><strong>{metro.city}, {metro.state}</strong><small>about {Math.round(metro.distanceMiles)} mi away</small></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function QuoteRouteMap({ pickup, delivery }) {
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pickupQuery = geocodeQuery(pickup);
  const deliveryQuery = geocodeQuery(delivery);
  const hasLane = pickupQuery !== 'USA' && deliveryQuery !== 'USA';

  useEffect(function() {
    if (!hasLane) {
      setRoute(null);
      setLoading(false);
      setError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async function() {
      setLoading(true);
      setError('');
      try {
        // Keep lookups sequential to be courteous to the shared geocoder.
        const pickupPoint = await geocodeLocation(pickup, controller.signal);
        const deliveryPoint = await geocodeLocation(delivery, controller.signal);
        setRoute({ pickup: pickupPoint, delivery: deliveryPoint });
      } catch (lookupError) {
        if (lookupError && lookupError.name === 'AbortError') return;
        setRoute(null);
        setError((lookupError && lookupError.message) || 'The lane could not be placed on the map.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 650);

    return function() {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pickupQuery, deliveryQuery, hasLane]); // eslint-disable-line react-hooks/exhaustive-deps

  const routeContext = useMemo(function() {
    if (!route) return { pickupMetros: [], deliveryMetros: [], markers: [], bounds: [] };
    const pickupMetros = findNearbyMajorCities(route.pickup, 3);
    const deliveryMetros = findNearbyMajorCities(route.delivery, 3);
    const markers = uniqueMetroMarkers(pickupMetros, deliveryMetros);
    return {
      pickupMetros,
      deliveryMetros,
      markers,
      bounds: [
        [route.pickup.lat, route.pickup.lng],
        [route.delivery.lat, route.delivery.lng]
      ]
    };
  }, [route]);

  if (!hasLane) {
    return (
      <div className="eq-route-map-state">
        <MapPin size={24} />
        <div><strong>Complete the lane to show the map</strong><span>Add pickup and delivery city/state or ZIP information above.</span></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="eq-route-map-state loading">
        <LoaderCircle size={24} className="spinning" />
        <div><strong>Locating this shipment</strong><span>Preparing the lane and nearby metro context…</span></div>
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="eq-route-map-state error">
        <AlertCircle size={24} />
        <div><strong>Map location unavailable</strong><span>{error || 'Check the city, state, and ZIP fields above.'}</span></div>
      </div>
    );
  }

  const line = routeContext.bounds;
  return (
    <div className="eq-route-context">
      <div className="eq-route-map-shell">
        <MapContainer center={DEFAULT_CENTER} zoom={4} className="eq-route-map" scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitRoute points={routeContext.bounds} />
          <Polyline positions={line} pathOptions={{ color: '#2388a8', weight: 4, opacity: 0.78, dashArray: '9 8' }} />
          <CircleMarker center={line[0]} radius={9} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#14715f', fillOpacity: 1 }}>
            <Tooltip permanent direction="top" offset={[0, -8]}><strong>Pickup</strong><br />{locationLabel(pickup)}</Tooltip>
          </CircleMarker>
          <CircleMarker center={line[1]} radius={9} pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#1f6fa7', fillOpacity: 1 }}>
            <Tooltip permanent direction="top" offset={[0, -8]}><strong>Delivery</strong><br />{locationLabel(delivery)}</Tooltip>
          </CircleMarker>
          {routeContext.markers.map(function(metro) {
            return (
              <CircleMarker
                key={metro.city + metro.state}
                center={[metro.lat, metro.lng]}
                radius={5}
                pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#f09b42', fillOpacity: 0.95 }}
              >
                <Tooltip direction="top"><strong>{metro.city}, {metro.state}</strong><br />Major metro</Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
        <div className="eq-route-map-legend" aria-label="Map legend">
          <span><i className="pickup" />Pickup</span>
          <span><i className="delivery" />Delivery</span>
          <span><i className="metro" />Major metro</span>
        </div>
      </div>

      <div className="eq-route-metro-grid">
        <MetroList label="Near pickup" location={pickup} metros={routeContext.pickupMetros} tone="pickup" />
        <MetroList label="Near delivery" location={delivery} metros={routeContext.deliveryMetros} tone="delivery" />
      </div>
      <p className="eq-route-disclaimer">Distances are approximate straight-line context, not truck-route mileage. Confirm routing, restrictions, and service before quoting.</p>
    </div>
  );
}
