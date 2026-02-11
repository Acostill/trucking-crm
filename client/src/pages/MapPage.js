import React, { useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import GlobalTopbar from '../components/GlobalTopbar';
import { MapContainer, Marker, TileLayer, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import CalculateRatePage from './CalculateRatePage';

const defaultCenter = [39.8283, -98.5795];
const defaultZoom = 4;

const markerIcon = new L.Icon({
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click: function(e) {
      onSelect(e.latlng);
    }
  });
  return null;
}

function formatLocationSummary(details) {
  if (!details) return '-';
  var city = details.city || '';
  var state = details.state || '';
  var zip = details.zip || '';
  var parts = [];
  if (city) parts.push(city);
  if (state) parts.push(state);
  var main = parts.join(', ');
  return (main + (zip ? (main ? ' ' : '') + zip : '')).trim() || '-';
}

function buildArcPositions(from, to) {
  if (!from || !to) return null;
  var lat1 = from.lat;
  var lng1 = from.lng;
  var lat2 = to.lat;
  var lng2 = to.lng;
  // Simple straight line between pickup and delivery
  return [
    [lat1, lng1],
    [lat2, lng2]
  ];
}

export default function MapPage() {
  const [mode, setMode] = useState('pickup');
  const [pickupLocation, setPickupLocation] = useState(null);
  const [deliveryLocation, setDeliveryLocation] = useState(null);
  const [pickupDetails, setPickupDetails] = useState(null);
  const [deliveryDetails, setDeliveryDetails] = useState(null);
  const [lookupError, setLookupError] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const markers = useMemo(function() {
    const items = [];
    if (pickupLocation) items.push({ id: 'pickup', position: pickupLocation });
    if (deliveryLocation) items.push({ id: 'delivery', position: deliveryLocation });
    return items;
  }, [pickupLocation, deliveryLocation]);

  async function reverseGeocode(latlng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latlng.lat}&lon=${latlng.lng}&addressdetails=1&email=support@trucking-crm.app`;
    const resp = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      throw new Error('Failed to look up address');
    }
    const data = await resp.json();
    const address = data && data.address ? data.address : {};
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.hamlet ||
      address.county ||
      '';
    const state = address.state || address.state_code || '';
    const zip = address.postcode || '';
    const country = address.country_code ? address.country_code.toUpperCase() : 'US';
    return { city, state, zip, country, latlng };
  }

  async function handleSelectLocation(latlng) {
    if (mode === 'pickup') {
      setPickupLocation(latlng);
    } else {
      setDeliveryLocation(latlng);
    }
    setLookupLoading(true);
    setLookupError(null);
    try {
      const details = await reverseGeocode(latlng);
      if (mode === 'pickup') {
        setPickupDetails(details);
      } else {
        setDeliveryDetails(details);
      }
    } catch (err) {
      setLookupError('Address lookup failed. Please enter details manually.');
    } finally {
      setLookupLoading(false);
    }
  }

  const ratePrefill = useMemo(function() {
    const pickup = pickupDetails || {};
    const delivery = deliveryDetails || {};
    return {
      pickupCity: pickup.city || '',
      pickupState: pickup.state || '',
      pickupZip: pickup.zip || '',
      pickupCountry: pickup.country || 'US',
      deliveryCity: delivery.city || '',
      deliveryState: delivery.state || '',
      deliveryZip: delivery.zip || '',
      deliveryCountry: delivery.country || 'US'
    };
  }, [pickupDetails, deliveryDetails]);

  const arcPositions = useMemo(function() {
    return buildArcPositions(pickupLocation, deliveryLocation);
  }, [pickupLocation, deliveryLocation]);

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="app-main">
        <GlobalTopbar />
        <div className="app-blob app-blob-1" />
        <div className="app-blob app-blob-2" />

        <div className="app-content map-page">
          <div className="page-header">
            <h1 className="page-title">Map</h1>
            <p className="page-subtitle">Click the map to select pickup and delivery locations.</p>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="title">Select locations</h2>
              <div className="subtitle">Choose pickup or delivery, then click the map.</div>
            </div>
            <div className="card-body">
              <div className="map-toolbar">
                <div className="map-mode">
                  <button
                    type="button"
                    className={`btn ${mode === 'pickup' ? '' : 'btn-ghost'}`}
                    onClick={() => setMode('pickup')}
                  >
                    Pickup
                  </button>
                  <button
                    type="button"
                    className={`btn ${mode === 'delivery' ? '' : 'btn-ghost'}`}
                    onClick={() => setMode('delivery')}
                  >
                    Delivery
                  </button>
                </div>
                <div className="map-coordinates">
                  <div>
                    <span className="map-label">Pickup</span>
                    <span className="map-value">{formatLocationSummary(pickupDetails)}</span>
                  </div>
                  <div>
                    <span className="map-label">Delivery</span>
                    <span className="map-value">{formatLocationSummary(deliveryDetails)}</span>
                  </div>
                </div>
              </div>
              {lookupLoading && <div className="map-status">Looking up address…</div>}
              {lookupError && <div className="map-status error">{lookupError}</div>}

              <div className="map-container">
                <MapContainer center={defaultCenter} zoom={defaultZoom} className="leaflet-map">
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapClickHandler onSelect={handleSelectLocation} />
                  {arcPositions && (
                    <Polyline
                      positions={arcPositions}
                      pathOptions={{ color: '#2563eb', weight: 4 }}
                    />
                  )}
                  {markers.map((marker) => (
                    <Marker key={marker.id} position={marker.position} icon={markerIcon} />
                  ))}
                </MapContainer>
              </div>
            </div>

            <div className="card">
              <div className="card-header">
                <h2 className="title">Calculate rate</h2>
                <div className="subtitle">Pickup and delivery will prefill from map selections.</div>
              </div>
              <div className="card-body">
                <CalculateRatePage embedded initialValues={{}} prefill={ratePrefill} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
