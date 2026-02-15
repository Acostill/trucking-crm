import React, { useState, useRef } from 'react';
import QuoteCard from '../components/QuoteCard';
import { buildApiUrl } from '../config';
import GlobalTopbar from '../components/GlobalTopbar';
import { useLocation } from 'react-router-dom';
import { MapContainer, Marker, TileLayer, Polyline, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function getDefaultPickupDateIso() {
  var d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

const DEFAULT_INITIAL_VALUES = {
  pickupCity: '',
  pickupState: '',
  pickupZip: '',
  pickupCountry: 'US',
  pickupDate: getDefaultPickupDateIso(),
  deliveryCity: '',
  deliveryState: '',
  deliveryZip: '',
  deliveryCountry: 'US',
  piecesUnit: '',
  part1Length: '',
  part1Width: '',
  part1Height: '',
  part2Length: '',
  part2Width: '',
  part2Height: '',
  weightUnit: '',
  hazardousUnNumbersText: '',
  accessorialCodesText: '',
  shipmentId: '',
  referenceNumber: '',
  equipmentType: ''
};

const EMPTY_INITIAL_VALUES = Object.keys(DEFAULT_INITIAL_VALUES).reduce(function(acc, key) {
  acc[key] = '';
  return acc;
}, {});

const EMBEDDED_DEFAULT_VALUES = {
  pickupCity: '',
  pickupState: '',
  pickupZip: '',
  pickupCountry: 'US',
  pickupDate: '',
  deliveryCity: '',
  deliveryState: '',
  deliveryZip: '',
  deliveryCountry: 'US',
  piecesUnit: '',
  part1Length: '',
  part1Width: '',
  part1Height: '',
  part2Length: '',
  part2Width: '',
  part2Height: '',
  weightUnit: '',
  hazardousUnNumbersText: '',
  accessorialCodesText: '',
  shipmentId: '',
  referenceNumber: '',
  equipmentType: ''
};

const MAP_DEFAULT_CENTER = [39.8283, -98.5795];
const MAP_DEFAULT_ZOOM = 4;

const mapMarkerIcon = new L.Icon({
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

function isoToDateInput(value) {
  if (!value) return '';
  // If it's already in YYYY-MM-DD format, return as-is
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  var d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  var year = d.getUTCFullYear();
  var month = String(d.getUTCMonth() + 1).padStart(2, '0');
  var day = String(d.getUTCDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function dateInputToIso(value) {
  if (!value) return '';
  // Interpret as local date at midnight, then to ISO
  var d = new Date(value + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString();
}

function buildPickupDeliveryLine(from, to) {
  if (!from || !to) return null;
  return [
    [from.lat, from.lng],
    [to.lat, to.lng]
  ];
}

function MapClickHandler({ onSelect }) {
  useMapEvents({
    click: function(e) {
      onSelect(e.latlng);
    }
  });
  return null;
}

function buildPiecesRowsFrom(source) {
  const rows = [];
  if (source.part1Length || source.part1Width || source.part1Height) {
    rows.push({
      length: source.part1Length || '',
      width: source.part1Width || '',
      height: source.part1Height || '',
      weight: source.part1Weight || ''
    });
  }
  if (source.part2Length || source.part2Width || source.part2Height) {
    rows.push({
      length: source.part2Length || '',
      width: source.part2Width || '',
      height: source.part2Height || '',
      weight: source.part2Weight || ''
    });
  }
  if (!rows.length) {
    rows.push({ length: '', width: '', height: '', weight: '' });
  }
  return rows;
}

export default function CalculateRatePage({ embedded, initialValues, prefill, onSelectQuote }) {
  const location = useLocation();
  const mergedPrefill = prefill || (location && location.state ? location.state.prefill : null);
  var baseInit = embedded ? EMBEDDED_DEFAULT_VALUES : DEFAULT_INITIAL_VALUES;
  var init = initialValues ? { ...baseInit, ...initialValues } : baseInit;

  const [pickupCity, setPickupCity] = useState(init.pickupCity);
  const [pickupState, setPickupState] = useState(init.pickupState);
  const [pickupZip, setPickupZip] = useState(init.pickupZip);
  const [pickupCountry, setPickupCountry] = useState(init.pickupCountry || 'US');
  const [pickupDate, setPickupDate] = useState(init.pickupDate);

  const [deliveryCity, setDeliveryCity] = useState(init.deliveryCity);
  const [deliveryState, setDeliveryState] = useState(init.deliveryState);
  const [deliveryZip, setDeliveryZip] = useState(init.deliveryZip);
  const [deliveryCountry, setDeliveryCountry] = useState(init.deliveryCountry || 'US');

  const [piecesUnit, setPiecesUnit] = useState(init.piecesUnit);
  const [piecesRows, setPiecesRows] = useState(buildPiecesRowsFrom(init));

  const [weightUnit, setWeightUnit] = useState(init.weightUnit);
  const [manualTotalWeight, setManualTotalWeight] = useState('');

  const [hazardousUnNumbersText, setHazardousUnNumbersText] = useState(init.hazardousUnNumbersText);
  const [accessorialCodesText, setAccessorialCodesText] = useState(init.accessorialCodesText);

  const [shipmentId, setShipmentId] = useState(init.shipmentId);
  const [referenceNumber, setReferenceNumber] = useState(init.referenceNumber);
  const [equipmentType, setEquipmentType] = useState(init.equipmentType);

  // When a prefill object is provided (e.g., from email-paste), update fields
  React.useEffect(function() {
    console.log('[CalculateRatePage] prefill changed:', mergedPrefill);
    if (!mergedPrefill) return;
    
    console.log('[CalculateRatePage] Applying prefill values');
    function apply(setter, value) {
      if (value !== undefined && value !== null && value !== '') {
        setter(value);
      }
    }

    apply(setPickupCity, mergedPrefill.pickupCity);
    apply(setPickupState, mergedPrefill.pickupState);
    apply(setPickupZip, mergedPrefill.pickupZip);
    apply(setPickupCountry, mergedPrefill.pickupCountry);
    apply(setPickupDate, mergedPrefill.pickupDate);

    apply(setDeliveryCity, mergedPrefill.deliveryCity);
    apply(setDeliveryState, mergedPrefill.deliveryState);
    apply(setDeliveryZip, mergedPrefill.deliveryZip);
    apply(setDeliveryCountry, mergedPrefill.deliveryCountry);

    apply(setPiecesUnit, mergedPrefill.piecesUnit);
    apply(setWeightUnit, mergedPrefill.weightUnit);

    if (Array.isArray(mergedPrefill.piecesRows)) {
      setPiecesRows(mergedPrefill.piecesRows.map(function(row) {
        return {
          length: row.length || '',
          width: row.width || '',
          height: row.height || '',
          weight: row.weight || ''
        };
      }));
    } else if (
      mergedPrefill.part1Length || mergedPrefill.part1Width || mergedPrefill.part1Height ||
      mergedPrefill.part2Length || mergedPrefill.part2Width || mergedPrefill.part2Height
    ) {
      setPiecesRows(buildPiecesRowsFrom(mergedPrefill));
    } else if (mergedPrefill.piecesQuantity) {
      var count = Math.max(1, Number(mergedPrefill.piecesQuantity) || 1);
      setPiecesRows(function(prev) {
        var next = prev.slice(0, count);
        while (next.length < count) {
          next.push({ length: '', width: '', height: '', weight: '' });
        }
        return next;
      });
    }

    if (mergedPrefill.weightValue) {
      setPiecesRows(function(prev) {
        var hasWeight = prev.some(function(row) { return row.weight; });
        if (hasWeight) return prev;
        var next = prev.slice();
        next[0] = { ...next[0], weight: mergedPrefill.weightValue };
        return next;
      });
    }

    apply(setHazardousUnNumbersText, mergedPrefill.hazardousUnNumbersText);
    apply(setAccessorialCodesText, mergedPrefill.accessorialCodesText);

    apply(setShipmentId, mergedPrefill.shipmentId);
    apply(setReferenceNumber, mergedPrefill.referenceNumber);
    apply(setEquipmentType, mergedPrefill.equipmentType || mergedPrefill.truckType);

    // Set manual total weight if provided in prefill
    if (mergedPrefill.manualTotalWeight !== undefined && mergedPrefill.manualTotalWeight !== null && mergedPrefill.manualTotalWeight !== '') {
      setManualTotalWeight(String(mergedPrefill.manualTotalWeight));
    }
  }, [mergedPrefill]);

  // Ensure country fields are always set to "US"
  React.useEffect(function() {
    if (pickupCountry !== 'US') {
      setPickupCountry('US');
    }
    if (deliveryCountry !== 'US') {
      setDeliveryCountry('US');
    }
  }, [pickupCountry, deliveryCountry]);

  // Sync manual total weight: clear it when all pieces have weights (switch back to computed mode)
  React.useEffect(function() {
    if (!hasMissingWeights(piecesRows) && manualTotalWeight !== '') {
      setManualTotalWeight('');
    }
  }, [piecesRows, manualTotalWeight]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [forwardResult, setForwardResult] = useState(null);
  const [datResult, setDatResult] = useState(null);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState(null);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactConfirmation, setContactConfirmation] = useState('');
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);
  const [dimensionsFile, setDimensionsFile] = useState(null);
  const [dimensionsLoading, setDimensionsLoading] = useState(false);
  const [dimensionsError, setDimensionsError] = useState(null);

  const [mapMode, setMapMode] = useState('pickup');
  const [pickupMarker, setPickupMarker] = useState(null);
  const [deliveryMarker, setDeliveryMarker] = useState(null);
  const [mapLookupLoading, setMapLookupLoading] = useState(false);
  const [mapLookupError, setMapLookupError] = useState(null);

  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiListening, setAiListening] = useState(false);
  const recognitionRef = useRef(null);
  const [aiOpen, setAiOpen] = useState(false);

  const [pickupZipOptions, setPickupZipOptions] = useState([]);
  const [pickupZipLoading, setPickupZipLoading] = useState(false);
  const [pickupZipError, setPickupZipError] = useState(null);
  const [showPickupZipOptions, setShowPickupZipOptions] = useState(false);

  const [deliveryZipOptions, setDeliveryZipOptions] = useState([]);
  const [deliveryZipLoading, setDeliveryZipLoading] = useState(false);
  const [deliveryZipError, setDeliveryZipError] = useState(null);
  const [showDeliveryZipOptions, setShowDeliveryZipOptions] = useState(false);

  const pickupZipAbortRef = useRef(null);
  const deliveryZipAbortRef = useRef(null);

  const pickupDeliveryLine = React.useMemo(function() {
    return buildPickupDeliveryLine(pickupMarker, deliveryMarker);
  }, [pickupMarker, deliveryMarker]);

  function buildZipSearchUrl(code) {
    var base = 'https://app.zipcodebase.com/api/v1/search';
    var apiKey = '44ceb090-0620-11f1-b2cd-796c895a7671';
    return base + '?apikey=' + encodeURIComponent(apiKey) + '&codes=' + encodeURIComponent(code) + '&country=US';
  }

  function mapZipResults(code, payload) {
    var results = payload && payload.results ? payload.results[code] : null;
    if (!Array.isArray(results)) return [];
    return results
      .filter(function(item) { return !item.country_code || item.country_code === 'US'; })
      .map(function(item) {
        return {
          zip: item.postal_code,
          city: item.city_en || item.city || '',
          state: item.state_code || item.state || '',
          country: item.country_code || 'US',
          lat: item.latitude != null ? Number(item.latitude) : null,
          lng: item.longitude != null ? Number(item.longitude) : null
        };
      });
  }

  React.useEffect(function() {
    var code = String(pickupZip || '').trim();
    if (code.length < 3) {
      setPickupZipOptions([]);
      setPickupZipLoading(false);
      setPickupZipError(null);
      return;
    }
    if (pickupZipAbortRef.current) {
      pickupZipAbortRef.current.abort();
    }
    var controller = new AbortController();
    pickupZipAbortRef.current = controller;
    setPickupZipLoading(true);
    setPickupZipError(null);
    fetch(buildZipSearchUrl(code), { signal: controller.signal })
      .then(function(resp) {
        if (!resp.ok) {
          throw new Error('Zip search failed');
        }
        return resp.json();
      })
      .then(function(data) {
        var mapped = mapZipResults(code, data);
        setPickupZipOptions(mapped);
        if (!pickupMarker && mapped.length && mapped[0].lat != null && mapped[0].lng != null) {
          setPickupMarker({ lat: mapped[0].lat, lng: mapped[0].lng });
        }
      })
      .catch(function(err) {
        if (err && err.name === 'AbortError') return;
        setPickupZipError('Zip search failed.');
        setPickupZipOptions([]);
      })
      .finally(function() {
        setPickupZipLoading(false);
      });
    return function() {
      controller.abort();
    };
  }, [pickupZip]);

  React.useEffect(function() {
    var code = String(deliveryZip || '').trim();
    if (code.length < 3) {
      setDeliveryZipOptions([]);
      setDeliveryZipLoading(false);
      setDeliveryZipError(null);
      return;
    }
    if (deliveryZipAbortRef.current) {
      deliveryZipAbortRef.current.abort();
    }
    var controller = new AbortController();
    deliveryZipAbortRef.current = controller;
    setDeliveryZipLoading(true);
    setDeliveryZipError(null);
    fetch(buildZipSearchUrl(code), { signal: controller.signal })
      .then(function(resp) {
        if (!resp.ok) {
          throw new Error('Zip search failed');
        }
        return resp.json();
      })
      .then(function(data) {
        var mapped = mapZipResults(code, data);
        setDeliveryZipOptions(mapped);
        if (!deliveryMarker && mapped.length && mapped[0].lat != null && mapped[0].lng != null) {
          setDeliveryMarker({ lat: mapped[0].lat, lng: mapped[0].lng });
        }
      })
      .catch(function(err) {
        if (err && err.name === 'AbortError') return;
        setDeliveryZipError('Zip search failed.');
        setDeliveryZipOptions([]);
      })
      .finally(function() {
        setDeliveryZipLoading(false);
      });
    return function() {
      controller.abort();
    };
  }, [deliveryZip]);

  function applyZipSelection(option, kind) {
    if (!option) return;
    if (kind === 'pickup') {
      setPickupZip(option.zip || '');
      setPickupCity(option.city || '');
      setPickupState(option.state || '');
      setPickupCountry(option.country || 'US');
      setShowPickupZipOptions(false);
    } else {
      setDeliveryZip(option.zip || '');
      setDeliveryCity(option.city || '');
      setDeliveryState(option.state || '');
      setDeliveryCountry(option.country || 'US');
      setShowDeliveryZipOptions(false);
    }
  }

  function ensureRecognition() {
    if (recognitionRef.current) return recognitionRef.current;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = function(event) {
      const transcript = event.results && event.results[0] && event.results[0][0]
        ? event.results[0][0].transcript
        : '';
      if (transcript) {
        setAiInput(transcript);
      }
    };
    recognition.onend = function() {
      setAiListening(false);
    };
    recognition.onerror = function(event) {
      setAiListening(false);
      var reason = event && event.error ? String(event.error) : 'unknown';
      if (reason === 'not-allowed' || reason === 'service-not-allowed') {
        setAiError('Microphone access was blocked. Allow mic permissions and use HTTPS or localhost.');
        return;
      }
      if (reason === 'no-speech') {
        setAiError('No speech detected. Please try again or type your request.');
        return;
      }
      if (reason === 'audio-capture') {
        setAiError('No microphone found. Please connect a mic or type your request.');
        return;
      }
      setAiError('Voice input failed (' + reason + '). Please type your request.');
    };
    recognitionRef.current = recognition;
    return recognition;
  }

  function handleStartVoice() {
    const recognition = ensureRecognition();
    if (!recognition) {
      setAiError('Voice input is not supported in this browser.');
      return;
    }
    setAiError(null);
    setAiListening(true);
    try {
      recognition.start();
    } catch (_err) {
      setAiListening(false);
      setAiError('Voice input failed to start. Please type your request.');
    }
  }

  function handleStopVoice() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setAiListening(false);
  }

  function applyAiResult(parsed) {
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.pickup) {
      if (parsed.pickup.city) setPickupCity(parsed.pickup.city);
      if (parsed.pickup.state) setPickupState(parsed.pickup.state);
      if (parsed.pickup.zip) setPickupZip(parsed.pickup.zip);
      if (parsed.pickup.country) setPickupCountry(parsed.pickup.country);
      if (parsed.pickup.date) setPickupDate(parsed.pickup.date);
    }
    if (parsed.delivery) {
      if (parsed.delivery.city) setDeliveryCity(parsed.delivery.city);
      if (parsed.delivery.state) setDeliveryState(parsed.delivery.state);
      if (parsed.delivery.zip) setDeliveryZip(parsed.delivery.zip);
      if (parsed.delivery.country) setDeliveryCountry(parsed.delivery.country);
    }
    if (parsed.pieces && Array.isArray(parsed.pieces.parts)) {
      const nextRows = [];
      parsed.pieces.parts.forEach(function(part) {
        const count = Math.max(1, Math.floor(Number(part.count) || 1));
        const pieceRow = {
          length: part.length != null ? String(part.length) : '',
          width: part.width != null ? String(part.width) : '',
          height: part.height != null ? String(part.height) : '',
          weight: part.weight != null ? String(part.weight) : ''
        };
        // Create 'count' number of rows with the same dimensions
        for (let i = 0; i < count; i++) {
          nextRows.push(pieceRow);
        }
      });
      if (nextRows.length) {
        setPiecesRows(nextRows);
      }
      if (parsed.pieces.unit) {
        setPiecesUnit(parsed.pieces.unit);
      }
    }
    if (parsed.weight) {
      if (parsed.weight.unit) setWeightUnit(parsed.weight.unit);
      if (parsed.weight.value != null) {
        setPiecesRows(function(prev) {
          if (!prev.length) return prev;
          var next = prev.slice();
          next[0] = { ...next[0], weight: String(parsed.weight.value) };
          return next;
        });
      }
    }
    if (parsed.equipmentType) setEquipmentType(parsed.equipmentType);
    if (Array.isArray(parsed.accessorialCodes)) {
      setAccessorialCodesText(parsed.accessorialCodes.join(', '));
    }
    if (Array.isArray(parsed.hazardousUnNumbers)) {
      setHazardousUnNumbersText(parsed.hazardousUnNumbers.join(', '));
    }
    if (parsed.shipmentId) setShipmentId(String(parsed.shipmentId));
    if (parsed.referenceNumber) setReferenceNumber(String(parsed.referenceNumber));
  }

  async function handleAiSubmit() {
    if (!aiInput.trim()) {
      setAiError('Please enter a request or use voice input.');
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const resp = await fetch(buildApiUrl('/api/ai/parse-calculate-rate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: aiInput })
      });
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || 'Failed to parse input.');
      }
      const data = await resp.json();
      applyAiResult(data);
    } catch (err) {
      setAiError(err && err.message ? err.message : 'Failed to parse input.');
    } finally {
      setAiLoading(false);
    }
  }

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
    return { city, state, zip, country };
  }

  async function handleMapPick(latlng) {
    if (mapMode === 'pickup') {
      setPickupMarker(latlng);
    } else {
      setDeliveryMarker(latlng);
    }
    setMapLookupLoading(true);
    setMapLookupError(null);
    try {
      const details = await reverseGeocode(latlng);
      if (mapMode === 'pickup') {
        setPickupCity(details.city || '');
        setPickupState(details.state || '');
        setPickupZip(details.zip || '');
        setPickupCountry(details.country || 'US');
      } else {
        setDeliveryCity(details.city || '');
        setDeliveryState(details.state || '');
        setDeliveryZip(details.zip || '');
        setDeliveryCountry(details.country || 'US');
      }
    } catch (_err) {
      setMapLookupError('Address lookup failed. You can edit the fields manually.');
    } finally {
      setMapLookupLoading(false);
    }
  }

  function updatePieceRow(index, key, value) {
    setPiecesRows(function(prev) {
      var next = prev.slice();
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function addPieceRow() {
    setPiecesRows(function(prev) {
      return prev.concat([{ length: '', width: '', height: '', weight: '' }]);
    });
  }

  function removePieceRow(index) {
    setPiecesRows(function(prev) {
      if (prev.length <= 1) return prev;
      return prev.filter(function(_row, idx) { return idx !== index; });
    });
  }

  function computeTotalWeight(rows) {
    return rows.reduce(function(sum, row) {
      var val = Number(row.weight);
      if (Number.isNaN(val)) return sum;
      return sum + val;
    }, 0);
  }

  function hasMissingWeights(rows) {
    return rows.some(function(row) {
      var weight = row.weight;
      return weight === '' || weight === null || weight === undefined || Number(weight) === 0;
    });
  }

  async function handleExtractDimensions() {
    if (!dimensionsFile) {
      setDimensionsError('Please select an image first.');
      return;
    }
    setDimensionsLoading(true);
    setDimensionsError(null);
    try {
      var formData = new FormData();
      formData.append('image', dimensionsFile);
      var resp = await fetch(buildApiUrl('/api/extract-dimensions-openrouter'), {
        method: 'POST',
        body: formData
      });
      if (!resp.ok) {
        var errorText = await resp.text();
        throw new Error(errorText || 'Failed to extract dimensions.');
      }
      var data = await resp.json();
      var pieces = Array.isArray(data.pieces) ? data.pieces : [];
      if (!pieces.length) {
        setDimensionsError('No dimensions were detected in the image.');
        return;
      }
      var mapped = pieces.map(function(piece) {
        return {
          length: piece.length_in != null ? String(piece.length_in) : '',
          width: piece.width_in != null ? String(piece.width_in) : '',
          height: piece.height_in != null ? String(piece.height_in) : '',
          weight: piece.weight != null ? String(piece.weight) : ''
        };
      });
      setPiecesRows(mapped);
    } catch (err) {
      setDimensionsError(err && err.message ? err.message : 'Failed to extract dimensions.');
    } finally {
      setDimensionsLoading(false);
    }
  }

  function buildPayload() {
    var computedWeight = computeTotalWeight(piecesRows);
    var hasMissing = hasMissingWeights(piecesRows);
    var manualWeightNum = Number(manualTotalWeight);
    var totalWeight = hasMissing && manualTotalWeight !== '' && !Number.isNaN(manualWeightNum)
      ? manualWeightNum
      : computedWeight;
    function toNumberOrUndefined(value) {
      var num = Number(value);
      return Number.isNaN(num) ? undefined : num;
    }
    return {
      pickup: {
        location: {
          city: pickupCity,
          state: pickupState,
          zip: pickupZip,
          country: pickupCountry
        },
        date: pickupDate
      },
      delivery: {
        location: {
          city: deliveryCity,
          state: deliveryState,
          zip: deliveryZip,
          country: deliveryCountry
        }
      },
      pieces: {
        unit: piecesUnit || 'in',
        quantity: piecesRows.length,
        parts: piecesRows.map(function(row) {
          return {
            length: toNumberOrUndefined(row.length),
            width: toNumberOrUndefined(row.width),
            height: toNumberOrUndefined(row.height),
            weight: toNumberOrUndefined(row.weight)
          };
        })
      },
      weight: {
        unit: weightUnit || 'lbs',
        value: totalWeight
      },
      hazardousMaterial: {
        unNumbers: hazardousUnNumbersText
          .split(',')
          .map(function(s) { return s.trim(); })
          .filter(function(s) { return s.length > 0; })
      },
      accessorialCodes: accessorialCodesText
        .split(',')
        .map(function(s) { return s.trim(); })
        .filter(function(s) { return s.length > 0; }),
      shipmentId: shipmentId,
      referenceNumber: referenceNumber,
      truckType: equipmentType || undefined
    };
  }

  function formatCurrency(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
    } catch (_err) {
      return `$${value.toFixed(2)}`;
    }
  }

  function formatNumber(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '-';
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
  }

  function resetContactForm() {
    setContactName('');
    setContactEmail('');
    setContactPhone('');
  }

  function handleSelectQuote(quote) {
    if (!quote || typeof quote !== 'object') return;
    
    // Always show the contact modal when a quote is selected
    resetContactForm();
    setContactConfirmation('');
    setSelectedQuote(quote);
    setIsContactModalOpen(true);
  }

  function handleCloseContactModal() {
    setSelectedQuote(null);
    setIsContactModalOpen(false);
  }

  function generateQuoteHTML(quote, shipment, contact) {
    var rate = quote.rate || {};
    var linehaul = rate.priceLineHaul;
    var rpm = rate.rpm;
    var total = quote.priceTotal;
    var truckType = quote.truckType;
    var transitTime = quote.transitTime;
    var rateCalculationID = quote.rateCalculationID;
    var accessorials = quote.priceAccessorials || [];
    var accessorialsTotal = accessorials.reduce(function(sum, a) {
      return sum + (Number(a.price) || 0);
    }, 0);

    var pickup = shipment.pickup || {};
    var delivery = shipment.delivery || {};
    var pickupLoc = pickup.location || {};
    var deliveryLoc = delivery.location || {};
    
    var quoteNumber = rateCalculationID || 'QUOTE-' + Date.now().toString().slice(-7);
    var quoteDate = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    var dueDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

    // Build items table rows
    var itemsRows = '';
    if (accessorials.length > 0) {
      accessorials.forEach(function(acc) {
        itemsRows += '<tr><td>' + (acc.name || acc.code || 'Accessorial') + '</td><td>$' + formatNumber(acc.price || 0) + '</td><td>01</td><td>$' + formatNumber(acc.price || 0) + '</td></tr>';
      });
    }
    itemsRows += '<tr><td>Linehaul Service</td><td>$' + formatNumber(linehaul || 0) + '</td><td>01</td><td>$' + formatNumber(linehaul || 0) + '</td></tr>';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      margin: 0;
      size: Letter;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #1a1a1a;
      line-height: 1.4;
      font-size: 12px;
      background: white;
    }
    .header-bar {
      background: #2d2d2d;
      color: white;
      padding: 20px 30px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .brand-section {
      flex: 1;
    }
    .brand-name {
      font-size: 28px;
      font-weight: 700;
      margin-bottom: 5px;
      color: white;
    }
    .brand-slogan {
      font-size: 12px;
      color: #e5e5e5;
      opacity: 0.9;
    }
    .contact-info {
      font-size: 9px;
      color: #b0b0b0;
      margin-top: 8px;
      line-height: 1.6;
    }
    .quote-label {
      background: #2563eb;
      color: white;
      padding: 15px 25px;
      font-size: 32px;
      font-weight: 700;
      text-align: center;
      align-self: center;
    }
    .main-content {
      padding: 30px;
    }
    .top-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: #2563eb;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .quote-to-name {
      font-size: 20px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 12px;
    }
    .info-line {
      font-size: 11px;
      color: #4a4a4a;
      margin-bottom: 6px;
      line-height: 1.6;
    }
    .info-line strong {
      color: #1a1a1a;
    }
    .invoice-details {
      text-align: right;
    }
    .invoice-detail-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 11px;
    }
    .invoice-detail-label {
      color: #4a4a4a;
      margin-right: 15px;
    }
    .invoice-detail-value {
      color: #1a1a1a;
      font-weight: 600;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    .items-table thead {
      background: #3a3a3a;
      color: white;
    }
    .items-table th {
      padding: 12px 15px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .items-table td {
      padding: 12px 15px;
      font-size: 11px;
      color: #1a1a1a;
      border-bottom: 1px solid #e5e5e5;
    }
    .items-table tbody tr:nth-child(even) {
      background: #f5f5f5;
    }
    .items-table tbody tr:nth-child(odd) {
      background: white;
    }
    .summary-section {
      margin-bottom: 30px;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 12px;
    }
    .summary-label {
      color: #4a4a4a;
    }
    .summary-value {
      color: #1a1a1a;
      font-weight: 600;
    }
    .grand-total {
      background: #2563eb;
      color: white;
      padding: 15px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
    }
    .grand-total-label {
      font-size: 16px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .grand-total-value {
      font-size: 24px;
      font-weight: 700;
    }
    .bottom-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 40px;
      margin-top: 40px;
    }
    .payment-section {
      margin-bottom: 30px;
    }
    .terms-section {
      margin-bottom: 30px;
    }
    .terms-text {
      font-size: 9px;
      color: #6a6a6a;
      line-height: 1.6;
      margin-top: 8px;
    }
    .signature-section {
      text-align: right;
    }
    .thank-you-bar {
      background: #2d2d2d;
      color: white;
      padding: 12px 20px;
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      margin-bottom: 15px;
    }
    .signature-name {
      font-size: 16px;
      font-weight: 700;
      color: #1a1a1a;
      margin-top: 10px;
    }
    .signature-title {
      font-size: 11px;
      color: #6a6a6a;
      margin-top: 5px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    @media print {
      body {
        font-size: 11px;
      }
      .section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="header-bar">
    <div class="brand-section">
      <div class="brand-name">FIRST CLASS TRUCKING</div>
      <div class="brand-slogan">Freight Logistics Simplified</div>
      <div class="contact-info">
        Phone: +1 (555) 123-4567 | Email: info@firstclasstrucking.com | Website: www.firstclasstrucking.com
      </div>
    </div>
    <div class="quote-label">QUOTE</div>
  </div>
  
  <div class="main-content">
    <div class="top-section">
      <div>
        <div class="section-title">QUOTE TO</div>
        <div class="quote-to-name">${contact.name || 'Customer'}</div>
        <div class="info-line"><strong>PHONE:</strong> ${contact.phone || '+000 1234 5678'}</div>
        <div class="info-line"><strong>EMAIL:</strong> ${contact.email || 'email@example.com'}</div>
        <div class="info-line"><strong>ADDRESS:</strong> ${contact.address || 'Business Address Here'}</div>
      </div>
      <div class="invoice-details">
        <div class="section-title">QUOTE DETAILS</div>
        <div class="invoice-detail-row">
          <span class="invoice-detail-label">Quote #</span>
          <span class="invoice-detail-value">${quoteNumber}</span>
        </div>
        <div class="invoice-detail-row">
          <span class="invoice-detail-label">Date</span>
          <span class="invoice-detail-value">${quoteDate}</span>
        </div>
        <div class="invoice-detail-row">
          <span class="invoice-detail-label">Due Date</span>
          <span class="invoice-detail-value">${dueDate}</span>
        </div>
        ${pickup.date ? '<div class="invoice-detail-row"><span class="invoice-detail-label">Pickup Date</span><span class="invoice-detail-value">' + new Date(pickup.date).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) + '</span></div>' : ''}
      </div>
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Item Description</th>
          <th>Unit Price</th>
          <th>Quantity</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows}
      </tbody>
    </table>

    <div class="summary-section">
      <div class="summary-row">
        <span class="summary-label">Sub Total</span>
        <span class="summary-value">${formatCurrency(total)}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">Tax</span>
        <span class="summary-value">0.00%</span>
      </div>
      <div class="grand-total">
        <span class="grand-total-label">GRAND TOTAL</span>
        <span class="grand-total-value">${formatCurrency(total)}</span>
      </div>
    </div>

    <div class="bottom-section">
      <div>
        <div class="payment-section">
          <div class="section-title">PAYMENT METHOD</div>
          <div class="info-line"><strong>Account Name:</strong> First Class Trucking</div>
          <div class="info-line"><strong>A/C Number:</strong> 000-0000-0000</div>
          <div class="info-line"><strong>Bank A/C:</strong> Your Bank A/C</div>
        </div>
        <div class="terms-section">
          <div class="section-title">TERMS & CONDITIONS</div>
          <div class="terms-text">
            This quote is valid for 15 days from the date of issue. All rates are subject to change based on final shipment details. Payment terms are net 30 days. Transit time estimates are approximate and may vary based on weather, traffic, and other factors beyond our control.
          </div>
        </div>
      </div>
      <div class="signature-section">
        <div class="thank-you-bar">Thank You For Your Business!</div>
        <div style="height: 50px; margin-top: 10px;"></div>
        <div class="signature-name">First Class Trucking</div>
        <div class="signature-title">Freight Logistics Team</div>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  async function handleContactSubmit(e) {
    e.preventDefault();
    if (!selectedQuote || isSubmittingContact) return;
    
    setIsSubmittingContact(true);
    try {
      var nameSnapshot = contactName;
      
      // Build shipment details from form fields
      var shipmentDetails = buildPayload();
    
    // Prepare contact info
    var contactInfo = {
      name: contactName,
      email: contactEmail,
      phone: contactPhone
    };
    
    // Generate PDF from quote HTML
    var pdfBlob = null;
    try {
      var quoteHTML = generateQuoteHTML(selectedQuote, shipmentDetails, contactInfo);
      var pdfResp = await fetch(buildApiUrl('/api/generate-pdf'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: quoteHTML,
          options: {
            format: 'Letter',
            margin: {
              top: '20mm',
              right: '20mm',
              bottom: '20mm',
              left: '20mm'
            },
            printBackground: true
          }
        })
      });
      
      if (pdfResp.ok) {
        pdfBlob = await pdfResp.blob();
        console.log('PDF generated successfully');
      } else {
        console.warn('Failed to generate PDF:', pdfResp.status);
      }
    } catch (pdfErr) {
      console.error('Error generating PDF:', pdfErr);
      // Continue even if PDF generation fails
    }
    
    // Prepare quote data for n8n webhook
    var quoteData = {
      contact: contactInfo,
      quote: {
        total: selectedQuote.priceTotal,
        linehaul: selectedQuote.rate && selectedQuote.rate.priceLineHaul,
        ratePerMile: selectedQuote.rate && selectedQuote.rate.rpm,
        truckType: selectedQuote.truckType,
        transitTime: selectedQuote.transitTime,
        rateCalculationID: selectedQuote.rateCalculationID,
        accessorials: selectedQuote.priceAccessorials || [],
        accessorialsTotal: (selectedQuote.priceAccessorials || []).reduce(function(sum, a) {
          return sum + (Number(a.price) || 0);
        }, 0)
      },
      shipment: shipmentDetails,
      submittedAt: new Date().toISOString()
    };
    
    // Send to n8n webhook with PDF as binary file
    try {
      const webhookUrl = 'https://n8n.srv850160.hstgr.cloud/webhook/c07b5090-d667-4563-91ea-071d65f6e67a';
      
      // Generate quote ID and save quote to our API
      var quoteId = 'quote-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      quoteData.id = quoteId;
      quoteData.quoteUrl = window.location.origin + '/quotes/' + quoteId;
      
      try {
        // Save quote to our API for later viewing
        var saveResp = await fetch(buildApiUrl('/api/quotes'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(quoteData)
        });
        
        if (saveResp.ok) {
          console.log('Quote saved to database with ID:', quoteId);
        } else {
          console.warn('Failed to save quote to database:', saveResp.status);
        }
      } catch (saveErr) {
        console.warn('Failed to save quote to API:', saveErr);
        // Continue even if save fails
      }
      
      if (pdfBlob) {
        // Use FormData to send PDF as binary file along with JSON data
        var formData = new FormData();
        
        // Add the PDF file
        var pdfFilename = 'quote-' + new Date().toISOString().split('T')[0] + '.pdf';
        formData.append('pdf', pdfBlob, pdfFilename);
        
        // Add the JSON data as a string (n8n can parse this)
        formData.append('data', JSON.stringify(quoteData));
        
        // Also add individual fields for easier access in n8n
        formData.append('contact_name', contactInfo.name || '');
        formData.append('contact_email', contactInfo.email || '');
        formData.append('contact_phone', contactInfo.phone || '');
        formData.append('quote_total', String(selectedQuote.priceTotal || ''));
        formData.append('quote_linehaul', String((selectedQuote.rate && selectedQuote.rate.priceLineHaul) || ''));
        formData.append('quote_truck_type', selectedQuote.truckType || '');
        formData.append('quote_transit_time', String(selectedQuote.transitTime || ''));
        formData.append('quote_id', quoteId);
        formData.append('quote_url', window.location.origin + '/quotes/' + quoteId);
        formData.append('submitted_at', new Date().toISOString());
        
        const webhookResp = await fetch(webhookUrl, {
          method: 'POST',
          body: formData
          // Don't set Content-Type header - browser will set it with boundary for FormData
        });
        
        if (!webhookResp.ok) {
          console.warn('n8n webhook returned non-OK status:', webhookResp.status);
        } else {
          console.log('Quote details with PDF binary sent to n8n webhook successfully');
        }
      } else {
        // Fallback: send JSON only if PDF generation failed
        const webhookResp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(quoteData)
        });
        
        if (!webhookResp.ok) {
          console.warn('n8n webhook returned non-OK status:', webhookResp.status);
        } else {
          console.log('Quote details sent to n8n webhook (without PDF)');
        }
      }
    } catch (webhookErr) {
      console.error('Error sending quote to n8n webhook:', webhookErr);
      // Don't block the flow if webhook fails
    }
    
    // If parent provided onSelectQuote callback, call it with the quote and contact info
    if (typeof onSelectQuote === 'function') {
      try {
        await onSelectQuote(selectedQuote, {
          name: contactName,
          email: contactEmail,
          phone: contactPhone
        });
      } catch (err) {
        console.error('Error in onSelectQuote callback:', err);
        // Still show confirmation even if callback fails
      }
    }
    
    console.log('Contact info submitted for quote:', {
      quote: selectedQuote,
      contact: {
        name: contactName,
        email: contactEmail,
        phone: contactPhone
      }
    });
    setContactConfirmation(
      nameSnapshot && nameSnapshot.length > 0
        ? `Thanks, ${nameSnapshot}. We'll reach out shortly.`
        : "Thanks! We'll reach out shortly."
    );
    resetContactForm();
    handleCloseContactModal();
    } finally {
      setIsSubmittingContact(false);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setForwardResult(null);
    setDatResult(null);

    var payload = buildPayload();

    try {
      // Make single unified call to /calculate-rate which returns both quotes
      var resp = await fetch(buildApiUrl('/calculate-rate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });

      if (!resp.ok) {
        var errorText = await resp.text();
        throw new Error(errorText || 'Failed to fetch quotes');
      }

      var combinedData = await resp.json();
      
      // Extract standardized results from unified response
      var expediteAllQuote = combinedData.expediteAll || null;
      var forwardAirQuote = combinedData.forwardAir || null;
      var datQuote = combinedData.datForecast || null;

      // Convert standardized format to QuoteCard format
      function toQuoteCardFormat(standardizedQuote) {
        if (!standardizedQuote || standardizedQuote.error) {
          return null;
        }
        
        return {
          source: standardizedQuote.source,
          rate: {
            priceLineHaul: standardizedQuote.lineHaul,
            rpm: standardizedQuote.ratePerMile
          },
          priceTotal: standardizedQuote.total,
          priceAccessorials: standardizedQuote.additionalInfo?.accessorials || [],
          truckType: standardizedQuote.additionalInfo?.truckType,
          transitTime: standardizedQuote.additionalInfo?.transitTime,
          rateCalculationID: standardizedQuote.additionalInfo?.rateCalculationID,
          mileage: standardizedQuote.additionalInfo?.mileage
        };
      }

      // Set ExpediteAll result
      if (expediteAllQuote && !expediteAllQuote.error) {
        var expediteAllFormatted = toQuoteCardFormat(expediteAllQuote);
        if (expediteAllFormatted) {
          setResult(expediteAllFormatted);
            }
      } else if (expediteAllQuote && expediteAllQuote.error) {
        console.error('[ExpediteAll] Quote error:', expediteAllQuote.error, expediteAllQuote);
          }

      // Set Forward Air result
      if (forwardAirQuote && !forwardAirQuote.error) {
        var forwardAirFormatted = toQuoteCardFormat(forwardAirQuote);
        if (forwardAirFormatted) {
          setForwardResult(forwardAirFormatted);
        }
      } else if (forwardAirQuote && forwardAirQuote.error) {
        console.error('[ForwardAir] Quote error:', forwardAirQuote.error, forwardAirQuote);
      }

      // Set DAT Forecast result
      if (datQuote && !datQuote.error) {
        var datFormatted = toQuoteCardFormat(datQuote);
        if (datFormatted) {
          setDatResult(datFormatted);
        }
      } else if (datQuote && datQuote.error) {
        console.error('[DAT] Quote error:', datQuote.error, datQuote);
      }
    } catch (err) {
      setError(err && err.message ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  var card = (
        <div className="card">
          <div className="card-header">
            <h2 className="title">Shipment details</h2>
            <div className="subtitle">Enter pickup, delivery and freight info</div>
          </div>
          <div className="card-body">
            {!embedded && (
              <fieldset>
                <legend>Map</legend>
                <div className="map-toolbar">
                  <div className="map-mode">
                    <button
                      type="button"
                      className={`btn ${mapMode === 'pickup' ? '' : 'btn-ghost'}`}
                      onClick={() => setMapMode('pickup')}
                    >
                      Pickup
                    </button>
                    <button
                      type="button"
                      className={`btn ${mapMode === 'delivery' ? '' : 'btn-ghost'}`}
                      onClick={() => setMapMode('delivery')}
                    >
                      Delivery
                    </button>
                  </div>
                  <div className="map-coordinates">
                    <div>
                      <span className="map-label">Pickup</span>
                      <span className="map-value">
                        {[pickupCity, pickupState].filter(Boolean).join(', ') +
                          (pickupZip ? (pickupCity || pickupState ? ' ' : '') + pickupZip : '') || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="map-label">Delivery</span>
                      <span className="map-value">
                        {[deliveryCity, deliveryState].filter(Boolean).join(', ') +
                          (deliveryZip ? (deliveryCity || deliveryState ? ' ' : '') + deliveryZip : '') || '-'}
                      </span>
                    </div>
                  </div>
                </div>
                {mapLookupLoading && <div className="map-status">Looking up address…</div>}
                {mapLookupError && <div className="map-status error">{mapLookupError}</div>}
                <div className="map-container">
                  <MapContainer center={MAP_DEFAULT_CENTER} zoom={MAP_DEFAULT_ZOOM} className="leaflet-map">
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <MapClickHandler onSelect={handleMapPick} />
                    {pickupDeliveryLine && (
                      <Polyline
                        positions={pickupDeliveryLine}
                        pathOptions={{ color: '#2563eb', weight: 4 }}
                      />
                    )}
                    {pickupMarker && <Marker position={pickupMarker} icon={mapMarkerIcon} />}
                    {deliveryMarker && <Marker position={deliveryMarker} icon={mapMarkerIcon} />}
                  </MapContainer>
                </div>
              </fieldset>
            )}
            <form onSubmit={onSubmit} className="form-grid">
              <fieldset>
                <legend>Pickup</legend>
                <div className="row-4">
                  <label>
                    Zip
                    <div className="zip-select">
                      <input
                        value={pickupZip}
                        onChange={function(e){ setPickupZip(e.target.value); }}
                        onFocus={function(){ setShowPickupZipOptions(true); }}
                        onBlur={function(){ setTimeout(function(){ setShowPickupZipOptions(false); }, 150); }}
                        placeholder="Search ZIP"
                      />
                      {showPickupZipOptions && (pickupZipLoading || pickupZipOptions.length || pickupZipError) ? (
                        <div className="zip-dropdown">
                          {pickupZipLoading && <div className="zip-loading">Searching…</div>}
                          {!pickupZipLoading && pickupZipError && <div className="zip-empty">{pickupZipError}</div>}
                          {!pickupZipLoading && !pickupZipError && !pickupZipOptions.length && (
                            <div className="zip-empty">No matches.</div>
                          )}
                          {!pickupZipLoading && !pickupZipError && pickupZipOptions.map(function(option, idx) {
                            return (
                              <button
                                key={option.zip + '-' + idx}
                                type="button"
                                className="zip-option"
                                onMouseDown={function(e) {
                                  e.preventDefault();
                                  applyZipSelection(option, 'pickup');
                                }}
                              >
                                <span>{option.zip}</span>
                                <span className="zip-option-meta">{option.city}{option.state ? ', ' + option.state : ''}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </label>
                  <label>
                    City
                    <input value={pickupCity} onChange={function(e){ setPickupCity(e.target.value); }} />
                  </label>
                  <label>
                    State
                    <input value={pickupState} onChange={function(e){ setPickupState(e.target.value); }} />
                  </label>
                  <label>
                    Country
                    <input value={pickupCountry || 'US'} onChange={function(e){ setPickupCountry(e.target.value); }} disabled />
                  </label>
                </div>
                <label>
                  Pickup date
                  <input
                    type="date"
                    value={isoToDateInput(pickupDate)}
                    onChange={function(e){ setPickupDate(dateInputToIso(e.target.value)); }}
                  />
                </label>
              </fieldset>

              <fieldset>
                <legend>Delivery</legend>
                <div className="row-4">
                  <label>
                    Zip
                    <div className="zip-select">
                      <input
                        value={deliveryZip}
                        onChange={function(e){ setDeliveryZip(e.target.value); }}
                        onFocus={function(){ setShowDeliveryZipOptions(true); }}
                        onBlur={function(){ setTimeout(function(){ setShowDeliveryZipOptions(false); }, 150); }}
                        placeholder="Search ZIP"
                      />
                      {showDeliveryZipOptions && (deliveryZipLoading || deliveryZipOptions.length || deliveryZipError) ? (
                        <div className="zip-dropdown">
                          {deliveryZipLoading && <div className="zip-loading">Searching…</div>}
                          {!deliveryZipLoading && deliveryZipError && <div className="zip-empty">{deliveryZipError}</div>}
                          {!deliveryZipLoading && !deliveryZipError && !deliveryZipOptions.length && (
                            <div className="zip-empty">No matches.</div>
                          )}
                          {!deliveryZipLoading && !deliveryZipError && deliveryZipOptions.map(function(option, idx) {
                            return (
                              <button
                                key={option.zip + '-' + idx}
                                type="button"
                                className="zip-option"
                                onMouseDown={function(e) {
                                  e.preventDefault();
                                  applyZipSelection(option, 'delivery');
                                }}
                              >
                                <span>{option.zip}</span>
                                <span className="zip-option-meta">{option.city}{option.state ? ', ' + option.state : ''}</span>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  </label>
                  <label>
                    City
                    <input value={deliveryCity} onChange={function(e){ setDeliveryCity(e.target.value); }} />
                  </label>
                  <label>
                    State
                    <input value={deliveryState} onChange={function(e){ setDeliveryState(e.target.value); }} />
                  </label>
                  <label>
                    Country
                    <input value={deliveryCountry || 'US'} onChange={function(e){ setDeliveryCountry(e.target.value); }} disabled />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Dimensions From Image</legend>
                <div className="row-2">
                  <label>
                    Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={function(e){ setDimensionsFile(e.target.files && e.target.files[0] ? e.target.files[0] : null); }}
                    />
                  </label>
                </div>
                <div className="actions" style={{ justifyContent: 'flex-start' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleExtractDimensions}
                    disabled={dimensionsLoading}
                  >
                    {dimensionsLoading ? 'Extracting…' : 'Get Dimensions From Image'}
                  </button>
                </div>
                {dimensionsError && (
                  <div className="error" style={{ marginTop: 10 }}>
                    {dimensionsError}
                  </div>
                )}
              </fieldset>

              <fieldset>
                <legend>Pieces</legend>
                {piecesRows.map(function(row, idx) {
                  return (
                    <div key={idx}>
                      <div className="row-4">
                        <label>
                          Length
                          <input
                            type="number"
                            value={row.length}
                            onChange={function(e){ updatePieceRow(idx, 'length', e.target.value); }}
                          />
                        </label>
                        <label>
                          Width
                          <input
                            type="number"
                            value={row.width}
                            onChange={function(e){ updatePieceRow(idx, 'width', e.target.value); }}
                          />
                        </label>
                        <label>
                          Height
                          <input
                            type="number"
                            value={row.height}
                            onChange={function(e){ updatePieceRow(idx, 'height', e.target.value); }}
                          />
                        </label>
                        <label>
                          Weight ({weightUnit || 'lbs'})
                          <input
                            type="number"
                            value={row.weight}
                            onChange={function(e){ updatePieceRow(idx, 'weight', e.target.value); }}
                          />
                        </label>
                      </div>
                      <div className="actions" style={{ justifyContent: 'flex-start' }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={function(){ removePieceRow(idx); }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="actions" style={{ justifyContent: 'flex-start' }}>
                  <button type="button" className="btn-secondary" onClick={addPieceRow}>
                    Add piece
                  </button>
                </div>
              </fieldset>

              <fieldset>
                <legend>Weight</legend>
                <div className="row-2">
                  <label>
                    Total Weight ({weightUnit || 'lbs'})
                    {hasMissingWeights(piecesRows) ? (
                      <input 
                        type="number" 
                        value={manualTotalWeight !== '' ? manualTotalWeight : computeTotalWeight(piecesRows)} 
                        onChange={function(e) { setManualTotalWeight(e.target.value); }}
                        placeholder={String(computeTotalWeight(piecesRows))}
                      />
                    ) : (
                      <input type="number" value={computeTotalWeight(piecesRows)} readOnly />
                    )}
                  </label>
                  <label>
                    Pieces Count
                    <input type="number" value={piecesRows.length} readOnly />
                  </label>
                </div>
              </fieldset>

              <fieldset>
                <legend>Equipment Type</legend>
                <label>
                  Equipment
                  <select value={equipmentType} onChange={function(e){ setEquipmentType(e.target.value); }}>
                    <option value="">Select equipment</option>
                    <option value="Box Truck">Box Truck</option>
                    <option value="Flatbed Hotshot">Flatbed Hotshot</option>
                    <option value="Sprinter Van">Sprinter Van</option>
                    <option value="Reefer">Reefer</option>
                    <option value="Dry Van">Dry Van</option>
                    <option value="Flatbed">Flatbed</option>
                  </select>
                </label>
              </fieldset>

              <div className="actions">
                <button className="btn" type="submit" disabled={loading}>
                  {loading ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </form>

            <div className="status">
              {error && (
                <div className="error">Error: {error}</div>
              )}
              {contactConfirmation && (
                <div className="success">{contactConfirmation}</div>
              )}
              {result && typeof result === 'object' && !Array.isArray(result) && (
                <QuoteCard quote={result} onSelectQuote={handleSelectQuote} />
              )}
              {forwardResult && typeof forwardResult === 'object' && !Array.isArray(forwardResult) && (
                <QuoteCard quote={forwardResult} onSelectQuote={handleSelectQuote} />
              )}
          {datResult && typeof datResult === 'object' && !Array.isArray(datResult) && (
            <QuoteCard quote={datResult} onSelectQuote={handleSelectQuote} />
          )}
              {result && (typeof result === 'string' || Array.isArray(result)) && (
                <div className="response">{typeof result === 'string' ? result : JSON.stringify(result)}</div>
              )}
            </div>
          </div>
        </div>
  );

  if (embedded) {
    return (
      <div className="calculate-rate-embedded">
        <div className="container">
          {card}
        </div>
        {isContactModalOpen && (
          <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
            <div className="modal">
              <div className="modal-header">
                <div>
                  <div id="contact-modal-title" className="modal-title">Share your contact details</div>
                  <div className="modal-subtitle">We’ll follow up about the selected quote.</div>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Close dialog"
                  onClick={handleCloseContactModal}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="modal-summary">
                  <div className="label">Quote total</div>
                  <div className="value">{formatCurrency(selectedQuote && selectedQuote.priceTotal)}</div>
                </div>
                <form className="modal-form" onSubmit={handleContactSubmit}>
                  <label>
                    Name
                    <input
                      value={contactName}
                      onChange={function(e){ setContactName(e.target.value); }}
                      required
                    />
                  </label>
                  <label>
                    Email
                    <input
                      type="email"
                      value={contactEmail}
                      onChange={function(e){ setContactEmail(e.target.value); }}
                      required
                    />
                  </label>
                  <label>
                    Phone
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={function(e){ setContactPhone(e.target.value); }}
                      required
                    />
                  </label>
                  <div className="modal-actions">
                    <button type="button" className="btn btn-ghost" onClick={handleCloseContactModal} disabled={isSubmittingContact}>
                      Cancel
                    </button>
                    <button type="submit" className="btn" disabled={isSubmittingContact}>
                      {isSubmittingContact ? (
                        <>
                          <span className="btn-spinner"></span>
                          Processing...
                        </>
                      ) : (
                        'Submit info'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="shell calculate-rate-page">
      <GlobalTopbar />
      <div className="container">
        {card}
      </div>
      {!embedded && (
        <div className="ai-widget-fixed">
          <button
            type="button"
            className="ai-widget-toggle"
            onClick={function() { setAiOpen(!aiOpen); }}
            aria-label={aiOpen ? 'Close assistant' : 'Open assistant'}
          >
            <i className="fa-regular fa-message" aria-hidden="true"></i>
          </button>
          {aiOpen && (
            <div className="ai-widget-panel">
              <div className="ai-widget-header">
                <div className="ai-widget-title">Shipment Assistant</div>
                <div className="ai-widget-subtitle">
                  Describe the load and we’ll fill the form.
                </div>
              </div>
              <div className="ai-box">
                <label>
                  Tell us the shipment details
                  <textarea
                    className="ai-textarea"
                    placeholder="Example: Pickup in Dallas TX 75201 on Jan 15, deliver to Phoenix AZ 85001. 2 pallets 48x40x48 inches, 2500 lbs, dry van."
                    value={aiInput}
                    onChange={function(e){ setAiInput(e.target.value); }}
                  />
                </label>
                <div className="ai-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={aiListening ? handleStopVoice : handleStartVoice}
                  >
                    {aiListening ? 'Stop Voice' : 'Use Voice'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={handleAiSubmit}
                    disabled={aiLoading}
                  >
                    {aiLoading ? 'Applying…' : 'Apply to Form'}
                  </button>
                </div>
                {aiError && <div className="ai-error">{aiError}</div>}
              </div>
            </div>
          )}
        </div>
      )}
      {isContactModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
          <div className="modal">
            <div className="modal-header">
              <div>
                <div id="contact-modal-title" className="modal-title">Share your contact details</div>
                <div className="modal-subtitle">We’ll follow up about the selected quote.</div>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close dialog"
                onClick={handleCloseContactModal}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="modal-summary">
                <div className="label">Quote total</div>
                <div className="value">{formatCurrency(selectedQuote && selectedQuote.priceTotal)}</div>
              </div>
              <form className="modal-form" onSubmit={handleContactSubmit}>
                <label>
                  Name
                  <input
                    value={contactName}
                    onChange={function(e){ setContactName(e.target.value); }}
                    required
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={function(e){ setContactEmail(e.target.value); }}
                    required
                  />
                </label>
                <label>
                  Phone
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={function(e){ setContactPhone(e.target.value); }}
                    required
                  />
                </label>
                <div className="modal-actions">
                  <button type="button" className="btn btn-ghost" onClick={handleCloseContactModal} disabled={isSubmittingContact}>
                    Cancel
                  </button>
                  <button type="submit" className="btn" disabled={isSubmittingContact}>
                    {isSubmittingContact ? (
                      <>
                        <span className="quote-modal-spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', display: 'inline-block', marginRight: '8px', verticalAlign: 'middle' }}></span>
                        Processing...
                      </>
                    ) : (
                      'Submit info'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Floating AI widget (rendered by parent pages if needed)
