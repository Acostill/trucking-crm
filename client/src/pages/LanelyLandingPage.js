import React, { useState, useEffect, useRef } from 'react';
import { buildApiUrl } from '../config';
import { 
  Truck, 
  MapPin, 
  Calendar, 
  Sparkles, 
  ArrowRight,
  Package,
  Scale,
  Info
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import LandingNavbar from '../components/LandingNavbar';

const EquipmentType = {
  DRY_VAN: 'Dry Van',
  REEFER: 'Reefer',
  FLATBED: 'Flatbed',
  BOX_TRUCK: 'Box Truck',
  FLATBED_HOTSHOT: 'Flatbed Hotshot',
  SPRINTER_VAN: 'Sprinter Van'
};

export default function LanelyLandingPage() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    origin: '',
    destination: '',
    pickupDate: '',
    equipment: EquipmentType.DRY_VAN,
    additionalInfo: '',
    originCity: '',
    originState: '',
    destinationCity: '',
    destinationState: ''
  });

  const [piecesRows, setPiecesRows] = useState([
    { length: '', width: '', height: '', weight: '' }
  ]);
  const [manualTotalWeight, setManualTotalWeight] = useState('');

  const [originZipOptions, setOriginZipOptions] = useState([]);
  const [originZipLoading, setOriginZipLoading] = useState(false);
  const [originZipError, setOriginZipError] = useState(null);
  const [showOriginZipOptions, setShowOriginZipOptions] = useState(false);

  const [destinationZipOptions, setDestinationZipOptions] = useState([]);
  const [destinationZipLoading, setDestinationZipLoading] = useState(false);
  const [destinationZipError, setDestinationZipError] = useState(null);
  const [showDestinationZipOptions, setShowDestinationZipOptions] = useState(false);

  const originZipAbortRef = useRef(null);
  const destinationZipAbortRef = useRef(null);

  // AI Assistant state
  const [aiOpen, setAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiListening, setAiListening] = useState(false);
  const recognitionRef = useRef(null);

  const buildZipSearchUrl = (code) => {
    const base = 'https://app.zipcodebase.com/api/v1/search';
    const apiKey = '44ceb090-0620-11f1-b2cd-796c895a7671';
    return base + '?apikey=' + encodeURIComponent(apiKey) + '&codes=' + encodeURIComponent(code) + '&country=US';
  };

  const mapZipResults = (code, payload) => {
    const results = payload && payload.results ? payload.results[code] : null;
    if (!Array.isArray(results)) return [];
    return results
      .filter((item) => !item.country_code || item.country_code === 'US')
      .map((item) => ({
        zip: item.postal_code,
        city: item.city_en || item.city || '',
        state: item.state_code || item.state || '',
        country: item.country_code || 'US'
      }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Piece management functions
  const addPieceRow = () => {
    setPiecesRows(prev => [...prev, { length: '', width: '', height: '', weight: '' }]);
  };

  const removePieceRow = (idx) => {
    if (piecesRows.length > 1) {
      setPiecesRows(prev => prev.filter((_, i) => i !== idx));
    }
  };

  const updatePieceRow = (idx, field, value) => {
    setPiecesRows(prev => prev.map((row, i) => 
      i === idx ? { ...row, [field]: value } : row
    ));
  };

  // Calculate total weight from all pieces
  const computeTotalWeight = (rows) => {
    return rows.reduce((sum, row) => {
      const val = Number(row.weight);
      if (Number.isNaN(val)) return sum;
      return sum + val;
    }, 0);
  };

  // Check if any piece has missing weight
  const hasMissingWeights = (rows) => {
    return rows.some((row) => {
      const weight = row.weight;
      return weight === '' || weight === null || weight === undefined || Number(weight) === 0;
    });
  };

  // Sync manual total weight: clear it when all pieces have weights (switch back to computed mode)
  useEffect(() => {
    if (!hasMissingWeights(piecesRows) && manualTotalWeight !== '') {
      setManualTotalWeight('');
    }
  }, [piecesRows, manualTotalWeight]);

  useEffect(() => {
    const value = (formData.origin || '').trim();
    if (!/^\d{3,}$/.test(value)) {
      setOriginZipOptions([]);
      setOriginZipLoading(false);
      setOriginZipError(null);
      return;
    }
    if (originZipAbortRef.current) {
      originZipAbortRef.current.abort();
    }
    const controller = new AbortController();
    originZipAbortRef.current = controller;
    setOriginZipLoading(true);
    setOriginZipError(null);
    fetch(buildZipSearchUrl(value), { signal: controller.signal })
      .then((resp) => {
        if (!resp.ok) throw new Error('Zip search failed');
        return resp.json();
      })
      .then((data) => {
        setOriginZipOptions(mapZipResults(value, data));
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        setOriginZipError('Zip search failed.');
        setOriginZipOptions([]);
      })
      .finally(() => {
        setOriginZipLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [formData.origin]);

  useEffect(() => {
    const value = (formData.destination || '').trim();
    if (!/^\d{3,}$/.test(value)) {
      setDestinationZipOptions([]);
      setDestinationZipLoading(false);
      setDestinationZipError(null);
      return;
    }
    if (destinationZipAbortRef.current) {
      destinationZipAbortRef.current.abort();
    }
    const controller = new AbortController();
    destinationZipAbortRef.current = controller;
    setDestinationZipLoading(true);
    setDestinationZipError(null);
    fetch(buildZipSearchUrl(value), { signal: controller.signal })
      .then((resp) => {
        if (!resp.ok) throw new Error('Zip search failed');
        return resp.json();
      })
      .then((data) => {
        setDestinationZipOptions(mapZipResults(value, data));
      })
      .catch((err) => {
        if (err && err.name === 'AbortError') return;
        setDestinationZipError('Zip search failed.');
        setDestinationZipOptions([]);
      })
      .finally(() => {
        setDestinationZipLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [formData.destination]);

  const applyZipSelection = (option, kind) => {
    if (!option) return;
    if (kind === 'origin') {
      setFormData((prev) => ({
        ...prev,
        origin: option.zip || '',
        originCity: option.city || '',
        originState: option.state || ''
      }));
      setShowOriginZipOptions(false);
    } else {
      setFormData((prev) => ({
        ...prev,
        destination: option.zip || '',
        destinationCity: option.city || '',
        destinationState: option.state || ''
      }));
      setShowDestinationZipOptions(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Generating quote for:", formData);
    const origin = (formData.origin || '').trim();
    const destination = (formData.destination || '').trim();
    const isZip = function(value) { return /^\d{5}(-\d{4})?$/.test(value); };

    // Calculate total weight - use manual if provided and pieces have missing weights, otherwise computed
    const computedWeight = computeTotalWeight(piecesRows);
    const hasMissing = hasMissingWeights(piecesRows);
    const manualWeightNum = Number(manualTotalWeight);
    const totalWeight = hasMissing && manualTotalWeight !== '' && !Number.isNaN(manualWeightNum)
      ? manualWeightNum
      : computedWeight;

    const prefill = {
      pickupCity: isZip(origin) ? (formData.originCity || '') : origin,
      pickupState: isZip(origin) ? (formData.originState || '') : '',
      pickupZip: isZip(origin) ? origin : '',
      deliveryCity: isZip(destination) ? (formData.destinationCity || '') : destination,
      deliveryState: isZip(destination) ? (formData.destinationState || '') : '',
      deliveryZip: isZip(destination) ? destination : '',
      pickupDate: formData.pickupDate || '',
      equipmentType: formData.equipment || '',
      piecesUnit: 'in',
      weightUnit: 'lbs',
      piecesRows: piecesRows.filter(row => row.length || row.width || row.height || row.weight),
      // Pass manual total weight separately if it was set and pieces have missing weights
      manualTotalWeight: hasMissing && manualTotalWeight !== '' && !Number.isNaN(manualWeightNum) 
        ? manualTotalWeight 
        : undefined
    };

    navigate('/calculate-rate', { state: { prefill } });
  };

  // AI Assistant functions
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
    
    // Map pickup location
    if (parsed.pickup) {
      if (parsed.pickup.zip) {
        setFormData(prev => ({
          ...prev,
          origin: parsed.pickup.zip,
          originCity: parsed.pickup.city || prev.originCity,
          originState: parsed.pickup.state || prev.originState
        }));
      } else if (parsed.pickup.city) {
        setFormData(prev => ({
          ...prev,
          origin: parsed.pickup.city + (parsed.pickup.state ? ', ' + parsed.pickup.state : ''),
          originCity: parsed.pickup.city,
          originState: parsed.pickup.state || prev.originState
        }));
      }
      if (parsed.pickup.date) {
        // Convert ISO date to YYYY-MM-DD format for date input
        const dateStr = parsed.pickup.date;
        let dateValue = dateStr;
        if (dateStr.includes('T')) {
          dateValue = dateStr.split('T')[0];
        } else if (dateStr.includes(' ')) {
          dateValue = dateStr.split(' ')[0];
        }
        setFormData(prev => ({ ...prev, pickupDate: dateValue }));
      }
    }
    
    // Map delivery location
    if (parsed.delivery) {
      if (parsed.delivery.zip) {
        setFormData(prev => ({
          ...prev,
          destination: parsed.delivery.zip,
          destinationCity: parsed.delivery.city || prev.destinationCity,
          destinationState: parsed.delivery.state || prev.destinationState
        }));
      } else if (parsed.delivery.city) {
        setFormData(prev => ({
          ...prev,
          destination: parsed.delivery.city + (parsed.delivery.state ? ', ' + parsed.delivery.state : ''),
          destinationCity: parsed.delivery.city,
          destinationState: parsed.delivery.state || prev.destinationState
        }));
      }
    }
    
    // Map equipment type
    if (parsed.equipmentType) {
      const equipmentMap = {
        'Dry Van': EquipmentType.DRY_VAN,
        'Reefer': EquipmentType.REEFER,
        'Flatbed': EquipmentType.FLATBED,
        'Box Truck': EquipmentType.BOX_TRUCK,
        'Flatbed Hotshot': EquipmentType.FLATBED_HOTSHOT,
        'Sprinter Van': EquipmentType.SPRINTER_VAN
      };
      const mappedEquipment = equipmentMap[parsed.equipmentType] || parsed.equipmentType;
      setFormData(prev => ({ ...prev, equipment: mappedEquipment }));
    }
    
    // Map pieces (multiple pieces support)
    if (parsed.pieces && Array.isArray(parsed.pieces.parts) && parsed.pieces.parts.length > 0) {
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
    }
    
    // Map total weight - handle both cases: with and without pieces
    if (parsed.weight && parsed.weight.value != null) {
      let weightValue = parsed.weight.value;
      const weightUnit = (parsed.weight.unit || '').toLowerCase();
      
      // Convert kgs to lbs if needed (1 kg = 2.20462 lbs)
      if (weightUnit === 'kg' || weightUnit === 'kgs' || weightUnit === 'kilogram' || weightUnit === 'kilograms') {
        weightValue = weightValue * 2.20462;
      }
      
      // If pieces were provided, set as manual total weight (since individual pieces might not have weights)
      if (parsed.pieces && Array.isArray(parsed.pieces.parts) && parsed.pieces.parts.length > 0) {
        setManualTotalWeight(String(Math.round(weightValue * 100) / 100)); // Round to 2 decimal places
      } else {
        // If no pieces provided, set weight on first piece
        setPiecesRows(prev => {
          if (prev.length === 0) {
            return [{ length: '', width: '', height: '', weight: String(Math.round(weightValue * 100) / 100) }];
          }
          const next = prev.slice();
          next[0] = { ...next[0], weight: String(Math.round(weightValue * 100) / 100) };
          return next;
        });
      }
    }
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
      setAiInput(''); // Clear input after successful submission
    } catch (err) {
      setAiError(err && err.message ? err.message : 'Failed to parse input.');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 relative overflow-x-hidden selection:bg-indigo-100 selection:text-indigo-900" style={{ backgroundColor: '#F8FAFC' }}>
      {/* Ambient Background Blobs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/30 blur-[120px]" style={{ background: 'rgba(199, 210, 254, 0.3)', filter: 'blur(120px)' }} />
        <div className="absolute top-[20%] right-[-5%] w-[40%] h-[40%] rounded-full bg-emerald-100/40 blur-[100px]" style={{ background: 'rgba(209, 250, 229, 0.4)', filter: 'blur(100px)' }} />
        <div className="absolute bottom-[-10%] left-[20%] w-[60%] h-[60%] rounded-full bg-slate-200/50 blur-[120px]" style={{ background: 'rgba(226, 232, 240, 0.5)', filter: 'blur(120px)' }} />
      </div>

      {/* Navigation Bar */}
      <LandingNavbar />

      {/* Hero Section */}
      <main className="landing-page-main relative z-10 pt-32 pb-20 lg:pt-48 lg:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto" style={{ paddingTop: '128px', paddingBottom: '80px', maxWidth: '1280px', margin: '0 auto' }}>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px' }}>
          
          {/* Left Side: Copy */}
          <div className="max-w-2xl animate-in slide-in-from-bottom-8 duration-700 fade-in sticky top-32">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold uppercase tracking-wider mb-6" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', borderRadius: '9999px', backgroundColor: '#eef2ff', color: '#4338ca', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '24px' }}>
              <span className="relative flex h-2 w-2" style={{ position: 'relative', display: 'flex', height: '8px', width: '8px' }}>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" style={{ position: 'absolute', height: '100%', width: '100%', borderRadius: '9999px', backgroundColor: '#818cf8', opacity: 0.75 }}></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" style={{ position: 'relative', display: 'inline-flex', height: '8px', width: '8px', borderRadius: '9999px', backgroundColor: '#6366f1' }}></span>
              </span>
              Live Capacity Available
            </div>
            
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 leading-[1.1] mb-6" style={{ fontSize: '3.75rem', lineHeight: 1.1, fontWeight: 700, color: '#0f172a', marginBottom: '24px' }}>
              Freight logistics, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-emerald-500" style={{ backgroundImage: 'linear-gradient(to right, #4f46e5, #10b981)', WebkitBackgroundClip: 'text', color: 'transparent' }}>simplified.</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-slate-500 mb-8 leading-relaxed max-w-lg" style={{ fontSize: '1.25rem', color: '#64748b', marginBottom: '32px', lineHeight: 1.625 }}>
              Get instant, guaranteed rates in seconds. No phone calls, no email chains, just reliable shipping capacity when you need it.
            </p>
            
            <div className="flex flex-wrap gap-4 items-center text-sm text-slate-500 font-medium" style={{ display: 'flex', gap: '16px', alignItems: 'center', fontSize: '14px', color: '#64748b', fontWeight: 500 }}>
              <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600" style={{ width: '20px', height: '20px', borderRadius: '9999px', backgroundColor: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                No hidden fees
              </div>
              <div className="flex items-center gap-2" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600" style={{ width: '20px', height: '20px', borderRadius: '9999px', backgroundColor: '#d1fae5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#059669' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                24/7 Support
              </div>
            </div>
          </div>

          {/* Right Side: Quote Widget */}
          <div className="relative animate-in slide-in-from-bottom-10 duration-1000 delay-200 fade-in" style={{ position: 'relative' }}>
            {/* Decorative element behind widget */}
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-2xl blur opacity-20 lg:opacity-30 transition duration-1000 group-hover:opacity-100" style={{ position: 'absolute', inset: '-4px', background: 'linear-gradient(to right, #6366f1, #34d399)', borderRadius: '16px', filter: 'blur(8px)', opacity: 0.2 }}></div>
            
            <div className="relative bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_32px_rgba(30,41,59,0.12)] rounded-2xl p-6 sm:p-8" style={{ position: 'relative', backgroundColor: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(24px)', border: '1px solid rgba(255, 255, 255, 0.5)', borderRadius: '16px', padding: '32px', boxShadow: '0 8px 32px rgba(30, 41, 59, 0.12)' }}>
              <div className="flex items-center justify-between mb-6" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2" style={{ fontSize: '1.125rem', fontWeight: 600, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} className="text-indigo-500" style={{ color: '#6366f1' }} />
                  Instant Quote
                </h3>
                <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100" style={{ fontSize: '0.75rem', fontWeight: 500, color: '#94a3b8', backgroundColor: '#f8fafc', padding: '4px 8px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                  Updated 2m ago
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" style={{ display: 'grid', gap: '16px' }}>
                {/* Route Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="space-y-1.5 group">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1" style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: '4px' }}>Origin</label>
                    <div className="relative" style={{ position: 'relative' }}>
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input 
                        type="text" 
                        name="origin"
                        value={formData.origin}
                        onChange={handleInputChange}
                        onFocus={() => setShowOriginZipOptions(true)}
                        onBlur={() => setTimeout(() => setShowOriginZipOptions(false), 150)}
                        placeholder="City or Zip"
                        className="w-full pl-9 pr-4 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                        style={{ width: '100%', paddingLeft: '36px', paddingRight: '16px', paddingTop: '10px', paddingBottom: '10px', backgroundColor: 'rgba(255, 255, 255, 0.6)', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: '#0f172a' }}
                      />
                      {showOriginZipOptions && (originZipLoading || originZipOptions.length || originZipError) ? (
                        <div className="zip-dropdown">
                          {originZipLoading && <div className="zip-loading">Searching…</div>}
                          {!originZipLoading && originZipError && <div className="zip-empty">{originZipError}</div>}
                          {!originZipLoading && !originZipError && !originZipOptions.length && (
                            <div className="zip-empty">No matches.</div>
                          )}
                          {!originZipLoading && !originZipError && originZipOptions.map((option, idx) => (
                            <button
                              key={option.zip + '-' + idx}
                              type="button"
                              className="zip-option"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                applyZipSelection(option, 'origin');
                              }}
                            >
                              <span>{option.zip}</span>
                              <span className="zip-option-meta">
                                {option.city}{option.state ? ', ' + option.state : ''}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-1.5 group">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1" style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: '4px' }}>Destination</label>
                    <div className="relative" style={{ position: 'relative' }}>
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input 
                        type="text" 
                        name="destination"
                        value={formData.destination}
                        onChange={handleInputChange}
                        onFocus={() => setShowDestinationZipOptions(true)}
                        onBlur={() => setTimeout(() => setShowDestinationZipOptions(false), 150)}
                        placeholder="City or Zip"
                        className="w-full pl-9 pr-4 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                        style={{ width: '100%', paddingLeft: '36px', paddingRight: '16px', paddingTop: '10px', paddingBottom: '10px', backgroundColor: 'rgba(255, 255, 255, 0.6)', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: '#0f172a' }}
                      />
                      {showDestinationZipOptions && (destinationZipLoading || destinationZipOptions.length || destinationZipError) ? (
                        <div className="zip-dropdown">
                          {destinationZipLoading && <div className="zip-loading">Searching…</div>}
                          {!destinationZipLoading && destinationZipError && <div className="zip-empty">{destinationZipError}</div>}
                          {!destinationZipLoading && !destinationZipError && !destinationZipOptions.length && (
                            <div className="zip-empty">No matches.</div>
                          )}
                          {!destinationZipLoading && !destinationZipError && destinationZipOptions.map((option, idx) => (
                            <button
                              key={option.zip + '-' + idx}
                              type="button"
                              className="zip-option"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                applyZipSelection(option, 'destination');
                              }}
                            >
                              <span>{option.zip}</span>
                              <span className="zip-option-meta">
                                {option.city}{option.state ? ', ' + option.state : ''}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Details Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="space-y-1.5 group">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1" style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: '4px' }}>Pickup Date</label>
                    <div className="relative" style={{ position: 'relative' }}>
                      <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input 
                        type="date" 
                        name="pickupDate"
                        value={formData.pickupDate}
                        onChange={handleInputChange}
                        className="w-full pl-9 pr-4 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm appearance-none"
                        style={{ width: '100%', paddingLeft: '36px', paddingRight: '16px', paddingTop: '10px', paddingBottom: '10px', backgroundColor: 'rgba(255, 255, 255, 0.6)', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: '#0f172a' }}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 group">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1" style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginLeft: '4px' }}>Equipment</label>
                    <div className="relative" style={{ position: 'relative' }}>
                      <Truck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <select 
                        name="equipment"
                        value={formData.equipment}
                        onChange={handleInputChange}
                        className="w-full pl-9 pr-8 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
                        style={{ width: '100%', paddingLeft: '36px', paddingRight: '32px', paddingTop: '10px', paddingBottom: '10px', backgroundColor: 'rgba(255, 255, 255, 0.6)', border: '1px solid #e2e8f0', borderRadius: '12px', fontSize: '14px', fontWeight: 500, color: '#0f172a' }}
                      >
                        <option value={EquipmentType.DRY_VAN}>Dry Van</option>
                        <option value={EquipmentType.REEFER}>Reefer</option>
                        <option value={EquipmentType.FLATBED}>Flatbed</option>
                        <option value={EquipmentType.BOX_TRUCK}>Box Truck</option>
                        <option value={EquipmentType.FLATBED_HOTSHOT}>Flatbed Hotshot</option>
                        <option value={EquipmentType.SPRINTER_VAN}>Sprinter Van</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Shipment Details Section */}
                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100" style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '12px', border: '1px solid #f1f5f9' }}>
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1" style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Package size={12} />
                    Shipment Details
                  </h4>
                  {piecesRows.map((row, idx) => (
                    <div key={idx} className="mb-3 last:mb-0" style={{ marginBottom: idx < piecesRows.length - 1 ? '12px' : '0' }}>
                      <div className="grid grid-cols-2 gap-3 mb-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '8px' }}>
                        <div className="relative group" style={{ position: 'relative' }}>
                          <Scale size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                          <input 
                            type="text" 
                            value={row.weight}
                            onChange={(e) => updatePieceRow(idx, 'weight', e.target.value)}
                            placeholder="Weight (lbs)"
                            className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            style={{ width: '100%', paddingLeft: '32px', paddingRight: '8px', paddingTop: '8px', paddingBottom: '8px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#0f172a' }}
                          />
                        </div>
                        <div className="flex gap-1" style={{ display: 'flex', gap: '4px' }}>
                          <input 
                            type="text" 
                            placeholder="L" 
                            className="w-full px-2 py-2 text-center bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500" 
                            onChange={(e) => updatePieceRow(idx, 'length', e.target.value)} 
                            value={row.length} 
                            style={{ width: '100%', padding: '8px', textAlign: 'center', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }} 
                          />
                          <input 
                            type="text" 
                            placeholder="W" 
                            className="w-full px-2 py-2 text-center bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500" 
                            onChange={(e) => updatePieceRow(idx, 'width', e.target.value)} 
                            value={row.width} 
                            style={{ width: '100%', padding: '8px', textAlign: 'center', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }} 
                          />
                          <input 
                            type="text" 
                            placeholder="H" 
                            className="w-full px-2 py-2 text-center bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500" 
                            onChange={(e) => updatePieceRow(idx, 'height', e.target.value)} 
                            value={row.height} 
                            style={{ width: '100%', padding: '8px', textAlign: 'center', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }} 
                          />
                        </div>
                      </div>
                      {piecesRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePieceRow(idx)}
                          className="text-xs text-slate-500 hover:text-red-500 transition-colors"
                          style={{ fontSize: '12px', color: '#64748b', cursor: 'pointer' }}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  {piecesRows.length > 1 && (
                    <div className="mt-3 pt-3 border-t border-slate-200" style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e2e8f0' }}>
                      <div className="flex items-center justify-between gap-3" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider flex-shrink-0" style={{ fontSize: '11px', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                          Total Weight
                        </span>
                        {hasMissingWeights(piecesRows) ? (
                          <input
                            type="number"
                            value={manualTotalWeight !== '' ? manualTotalWeight : computeTotalWeight(piecesRows)}
                            onChange={(e) => setManualTotalWeight(e.target.value)}
                            placeholder={String(computeTotalWeight(piecesRows))}
                            className="flex-1 text-sm font-bold text-slate-900 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                            style={{ 
                              flex: 1, 
                              fontSize: '14px', 
                              fontWeight: 700, 
                              color: '#0f172a', 
                              backgroundColor: 'white', 
                              border: '1px solid #e2e8f0', 
                              borderRadius: '8px', 
                              padding: '6px 8px',
                              textAlign: 'right'
                            }}
                          />
                        ) : (
                          <span className="text-sm font-bold text-slate-900" style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                            {computeTotalWeight(piecesRows).toLocaleString()} lbs
                          </span>
                        )}
                        {hasMissingWeights(piecesRows) && (
                          <span className="text-xs text-slate-500 flex-shrink-0" style={{ fontSize: '12px', color: '#64748b', flexShrink: 0 }}>
                            lbs
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={addPieceRow}
                    className="w-full mt-3 flex items-center justify-center gap-2 bg-white/80 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-indigo-600 hover:text-indigo-700 font-medium py-2.5 px-4 rounded-lg transition-all duration-200 shadow-sm hover:shadow-md"
                    style={{ 
                      width: '100%', 
                      marginTop: '12px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      gap: '8px', 
                      backgroundColor: 'rgba(255, 255, 255, 0.8)', 
                      border: '1px solid #e2e8f0', 
                      color: '#4f46e5', 
                      fontWeight: 500, 
                      padding: '10px 16px', 
                      borderRadius: '8px',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    <Package size={14} style={{ width: '14px', height: '14px' }} />
                    <span style={{ fontSize: '13px' }}>Add Piece</span>
                  </button>
                  <div className="relative group" style={{ position: 'relative' }}>
                     <Info size={14} className="absolute left-2.5 top-3 text-slate-400 group-focus-within:text-indigo-500 transition-colors" style={{ position: 'absolute', left: '10px', top: '12px', color: '#94a3b8' }} />
                     <textarea 
                      name="additionalInfo"
                      value={formData.additionalInfo}
                      onChange={handleInputChange}
                      placeholder="Additional Information (Optional)"
                      rows={2}
                      className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                      style={{ width: '100%', paddingLeft: '32px', paddingRight: '8px', paddingTop: '8px', paddingBottom: '8px', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '14px', color: '#0f172a', resize: 'none' }}
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full mt-2 group relative flex items-center justify-center gap-2 bg-slate-900 hover:bg-indigo-600 text-white font-semibold py-3.5 px-6 rounded-xl transition-all duration-300 shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98] overflow-hidden"
                  style={{ width: '100%', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', backgroundColor: '#0f172a', color: 'white', fontWeight: 600, padding: '14px 24px', borderRadius: '12px', position: 'relative', overflow: 'hidden' }}
                >
                  <Sparkles size={18} className="relative z-10 transition-transform group-hover:rotate-12" style={{ position: 'relative', zIndex: 10 }} />
                  <span className="relative z-10" style={{ position: 'relative', zIndex: 10 }}>View Instant Rates</span>
                  <ArrowRight size={18} className="relative z-10 transition-transform group-hover:translate-x-1" style={{ position: 'relative', zIndex: 10 }} />
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* Value Proposition Section */}
      <section id="features" className="relative z-10 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto" style={{ padding: '48px 16px', maxWidth: '1280px', margin: '0 auto' }}>
        <div className="grid md:grid-cols-3 gap-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '32px' }}>
          {/* Card 1 */}
          <div className="bg-white/40 backdrop-blur-md border border-white/50 p-8 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 group hover:-translate-y-1" style={{ backgroundColor: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.5)', borderRadius: '16px', padding: '32px' }}>
            <h3 className="text-xl font-semibold text-slate-900 mb-3" style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>Real-time Tracking</h3>
            <p className="text-slate-500 leading-relaxed" style={{ color: '#64748b', lineHeight: 1.625 }}>
              Watch your freight move on a live map with GPS updates every 15 minutes. No more guessing games.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white/40 backdrop-blur-md border border-white/50 p-8 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 group hover:-translate-y-1" style={{ backgroundColor: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.5)', borderRadius: '16px', padding: '32px' }}>
            <h3 className="text-xl font-semibold text-slate-900 mb-3" style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>Instant Booking</h3>
            <p className="text-slate-500 leading-relaxed" style={{ color: '#64748b', lineHeight: 1.625 }}>
              Secure capacity instantly with pre-vetted carriers. Lock in your rate with a single click.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white/40 backdrop-blur-md border border-white/50 p-8 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 group hover:-translate-y-1" style={{ backgroundColor: 'rgba(255, 255, 255, 0.4)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255, 255, 255, 0.5)', borderRadius: '16px', padding: '32px' }}>
            <h3 className="text-xl font-semibold text-slate-900 mb-3" style={{ fontSize: '1.25rem', fontWeight: 600, color: '#0f172a', marginBottom: '12px' }}>Paperless Operations</h3>
            <p className="text-slate-500 leading-relaxed" style={{ color: '#64748b', lineHeight: 1.625 }}>
              All your docs, BoLs, and PODs automatically organized in one place. Audit-ready, always.
            </p>
          </div>
        </div>
      </section>
      
      {/* Coverage Map Section */}
      <section id="coverage" className="relative z-10 py-24 bg-gradient-to-b from-slate-50 to-white border-y border-slate-200" style={{ padding: '96px 0', background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10" style={{ maxWidth: '1280px', margin: '0 auto', textAlign: 'center' }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold uppercase tracking-wider mb-6" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '4px 12px', borderRadius: '9999px', backgroundColor: '#eef2ff', color: '#4338ca', fontSize: '12px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '24px' }}>
            <MapPin size={12} />
            Nationwide Network
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4" style={{ fontSize: '2.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '16px' }}>We cover every mile.</h2>
          <p className="text-slate-500 max-w-2xl mx-auto mb-16" style={{ color: '#64748b', maxWidth: '42rem', margin: '0 auto 64px auto' }}>
            From coast to coast, our carrier network spans all 50 states. Live tracking of our active hubs and capacity.
          </p>

          <div className="relative w-full max-w-5xl mx-auto aspect-[16/9] flex items-center justify-center p-4" style={{ position: 'relative', width: '100%', maxWidth: '64rem', margin: '0 auto', aspectRatio: '16/9' }}>
            <div className="relative w-full h-full" style={{ position: 'relative', width: '100%', height: '100%' }}>
               {/* Map Image */}
               <img 
                src="https://upload.wikimedia.org/wikipedia/commons/1/1a/Blank_US_Map_%28states_only%29.svg" 
                alt="US Coverage Map" 
                className="w-full h-full object-contain opacity-70 contrast-125 drop-shadow-md"
                style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: 0.7, filter: 'contrast(1.25) drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200 bg-white/50 backdrop-blur-lg" style={{ borderTop: '1px solid #e2e8f0', backgroundColor: 'rgba(255, 255, 255, 0.5)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6" style={{ maxWidth: '1280px', margin: '0 auto', padding: '48px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="flex items-center gap-2">
             <span style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-1px', color: '#cbd5e1' }}>
                First Class Trucking
              </span>
          </div>
          <p className="text-sm text-slate-500" style={{ color: '#64748b', fontSize: '14px' }}>
            © {new Date().getFullYear()} First Class Trucking, Inc. All rights reserved.
          </p>
          <div className="flex gap-6" style={{ display: 'flex', gap: '24px' }}>
            <a href="#" className="text-slate-400 hover:text-indigo-600 transition-colors" style={{ color: '#94a3b8', textDecoration: 'none' }}>Privacy</a>
            <a href="#" className="text-slate-400 hover:text-indigo-600 transition-colors" style={{ color: '#94a3b8', textDecoration: 'none' }}>Terms</a>
            <a href="#" className="text-slate-400 hover:text-indigo-600 transition-colors" style={{ color: '#94a3b8', textDecoration: 'none' }}>Twitter</a>
          </div>
        </div>
      </footer>

      {/* AI Assistant Widget */}
      <div className="ai-widget-fixed">
        <button
          type="button"
          className="ai-widget-toggle"
          onClick={() => setAiOpen(!aiOpen)}
          aria-label={aiOpen ? 'Close assistant' : 'Open assistant'}
        >
          <i className="fa-regular fa-message" aria-hidden="true"></i>
        </button>
        {aiOpen && (
          <div className="ai-widget-panel">
            <div className="ai-widget-header">
              <div className="ai-widget-title">Shipment Assistant</div>
              <div className="ai-widget-subtitle">
                Describe the load and we'll fill the form.
              </div>
            </div>
            <div className="ai-box">
              <label>
                Tell us the shipment details
                <textarea
                  className="ai-textarea"
                  placeholder="Example: Pickup in Dallas TX 75201 on Jan 15, deliver to Phoenix AZ 85001. 2 pallets 48x40x48 inches, 2500 lbs, dry van."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
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
    </div>
  );
}

