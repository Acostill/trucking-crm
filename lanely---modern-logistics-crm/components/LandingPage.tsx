import React, { useState } from 'react';
import { 
  Truck, 
  MapPin, 
  Calendar, 
  Sparkles, 
  ArrowRight,
  Menu,
  X,
  Package,
  Scale,
  Info
} from 'lucide-react';
import { EquipmentType } from '../types';

export const LandingPage: React.FC = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [formData, setFormData] = useState({
    origin: '',
    destination: '',
    pickupDate: '',
    equipment: EquipmentType.DRY_VAN,
    weight: '',
    length: '',
    width: '',
    height: '',
    additionalInfo: ''
  });

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Generating quote for:", formData);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 relative overflow-x-hidden selection:bg-indigo-100 selection:text-indigo-900">
      {/* Ambient Background Blobs */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-200/30 blur-[120px]" />
        <div className="absolute top-[20%] right-[-5%] w-[40%] h-[40%] rounded-full bg-emerald-100/40 blur-[100px]" />
        <div className="absolute bottom-[-10%] left-[20%] w-[60%] h-[60%] rounded-full bg-slate-200/50 blur-[120px]" />
      </div>

      {/* Navigation Bar */}
      <nav className="fixed top-0 w-full z-50 transition-all duration-300 border-b border-white/20 bg-white/70 backdrop-blur-xl supports-[backdrop-filter]:bg-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center cursor-pointer group">
              <img 
                src="/logo.png" 
                alt="Lanely" 
                className="h-8 w-auto group-hover:scale-105 transition-transform duration-300" 
              />
            </div>

            {/* Desktop Links */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors">Features</a>
              <a href="#coverage" className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors">Network</a>
              <a href="#tracking" className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors">Track Shipment</a>
            </div>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <button className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">
                Carrier Login
              </button>
              <button className="bg-slate-900 hover:bg-indigo-600 text-white text-sm font-medium px-5 py-2.5 rounded-full transition-all shadow-lg hover:shadow-indigo-500/25 active:scale-95">
                Shipper Login
              </button>
            </div>

            {/* Mobile Menu Button */}
            <div className="md:hidden">
              <button 
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-slate-500 hover:text-slate-900 p-2"
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-16 left-0 w-full bg-white/95 backdrop-blur-xl border-b border-slate-200 p-4 flex flex-col gap-4 shadow-xl animate-in slide-in-from-top-2">
            <a href="#features" className="text-base font-medium text-slate-600 py-2">Features</a>
            <a href="#coverage" className="text-base font-medium text-slate-600 py-2">Network</a>
            <a href="#tracking" className="text-base font-medium text-slate-600 py-2">Track Shipment</a>
            <hr className="border-slate-100" />
            <div className="flex flex-col gap-3 mt-2">
              <button className="text-slate-600 font-medium py-2">Carrier Login</button>
              <button className="bg-indigo-600 text-white font-medium py-3 rounded-xl w-full">Shipper Login</button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 pt-32 pb-20 lg:pt-48 lg:pb-32 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          
          {/* Left Side: Copy */}
          <div className="max-w-2xl animate-in slide-in-from-bottom-8 duration-700 fade-in sticky top-32">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold uppercase tracking-wider mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              Live Capacity Available
            </div>
            
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 leading-[1.1] mb-6">
              Freight logistics, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-emerald-500">simplified.</span>
            </h1>
            
            <p className="text-lg sm:text-xl text-slate-500 mb-8 leading-relaxed max-w-lg">
              Get instant, guaranteed rates in seconds. No phone calls, no email chains, just reliable shipping capacity when you need it.
            </p>
            
            <div className="flex flex-wrap gap-4 items-center text-sm text-slate-500 font-medium">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                No hidden fees
              </div>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
                24/7 Support
              </div>
            </div>
          </div>

          {/* Right Side: Quote Widget */}
          <div className="relative animate-in slide-in-from-bottom-10 duration-1000 delay-200 fade-in">
            {/* Decorative element behind widget */}
            <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-2xl blur opacity-20 lg:opacity-30 transition duration-1000 group-hover:opacity-100"></div>
            
            <div className="relative bg-white/70 backdrop-blur-xl border border-white/50 shadow-[0_8px_32px_rgba(30,41,59,0.12)] rounded-2xl p-6 sm:p-8">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-500" />
                  Instant Quote
                </h3>
                <span className="text-xs font-medium text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                  Updated 2m ago
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Route Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 group">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Origin</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                      <input 
                        type="text" 
                        name="origin"
                        value={formData.origin}
                        onChange={handleInputChange}
                        placeholder="City or Zip"
                        className="w-full pl-9 pr-4 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 group">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Destination</label>
                    <div className="relative">
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                      <input 
                        type="text" 
                        name="destination"
                        value={formData.destination}
                        onChange={handleInputChange}
                        placeholder="City or Zip"
                        className="w-full pl-9 pr-4 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Details Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5 group">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Pickup Date</label>
                    <div className="relative">
                      <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                      <input 
                        type="date" 
                        name="pickupDate"
                        value={formData.pickupDate}
                        onChange={handleInputChange}
                        className="w-full pl-9 pr-4 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm appearance-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 group">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Equipment</label>
                    <div className="relative">
                      <Truck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                      <select 
                        name="equipment"
                        value={formData.equipment}
                        onChange={handleInputChange}
                        className="w-full pl-9 pr-8 py-2.5 bg-white/60 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-sm appearance-none cursor-pointer"
                      >
                        <option value={EquipmentType.DRY_VAN}>Dry Van</option>
                        <option value={EquipmentType.REEFER}>Reefer</option>
                        <option value={EquipmentType.FLATBED}>Flatbed</option>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1L5 5L9 1"/></svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shipment Details Section */}
                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100">
                  <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <Package size={12} />
                    Shipment Details
                  </h4>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="relative group">
                       <Scale size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                       <input 
                        type="text" 
                        name="weight"
                        value={formData.weight}
                        onChange={handleInputChange}
                        placeholder="Weight (lbs)"
                        className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      />
                    </div>
                    <div className="flex gap-1">
                      <input type="text" name="length" placeholder="L" className="w-full px-2 py-2 text-center bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500" onChange={handleInputChange} value={formData.length} />
                      <input type="text" name="width" placeholder="W" className="w-full px-2 py-2 text-center bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500" onChange={handleInputChange} value={formData.width} />
                      <input type="text" name="height" placeholder="H" className="w-full px-2 py-2 text-center bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-500" onChange={handleInputChange} value={formData.height} />
                    </div>
                  </div>
                  <div className="relative group">
                     <Info size={14} className="absolute left-2.5 top-3 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
                     <textarea 
                      name="additionalInfo"
                      value={formData.additionalInfo}
                      onChange={handleInputChange}
                      placeholder="Additional Information (Optional)"
                      rows={2}
                      className="w-full pl-8 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all resize-none"
                    />
                  </div>
                </div>

                <button 
                  type="submit"
                  className="w-full mt-2 group relative flex items-center justify-center gap-2 bg-slate-900 hover:bg-indigo-600 text-white font-semibold py-3.5 px-6 rounded-xl transition-all duration-300 shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98] overflow-hidden"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                  <Sparkles size={18} className="relative z-10 transition-transform group-hover:rotate-12" />
                  <span className="relative z-10">View Instant Rates</span>
                  <ArrowRight size={18} className="relative z-10 transition-transform group-hover:translate-x-1" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      {/* Value Proposition Section */}
      <section id="features" className="relative z-10 py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="bg-white/40 backdrop-blur-md border border-white/50 p-8 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 group hover:-translate-y-1">
            <h3 className="text-xl font-semibold text-slate-900 mb-3">Real-time Tracking</h3>
            <p className="text-slate-500 leading-relaxed">
              Watch your freight move on a live map with GPS updates every 15 minutes. No more guessing games.
            </p>
          </div>

          {/* Card 2 */}
          <div className="bg-white/40 backdrop-blur-md border border-white/50 p-8 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 group hover:-translate-y-1">
            <h3 className="text-xl font-semibold text-slate-900 mb-3">Instant Booking</h3>
            <p className="text-slate-500 leading-relaxed">
              Secure capacity instantly with pre-vetted carriers. Lock in your rate with a single click.
            </p>
          </div>

          {/* Card 3 */}
          <div className="bg-white/40 backdrop-blur-md border border-white/50 p-8 rounded-2xl shadow-sm hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-300 group hover:-translate-y-1">
            <h3 className="text-xl font-semibold text-slate-900 mb-3">Paperless Operations</h3>
            <p className="text-slate-500 leading-relaxed">
              All your docs, BoLs, and PODs automatically organized in one place. Audit-ready, always.
            </p>
          </div>
        </div>
      </section>
      
      {/* Coverage Map Section */}
      <section id="coverage" className="relative z-10 py-24 bg-gradient-to-b from-slate-50 to-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold uppercase tracking-wider mb-6">
            <MapPin size={12} />
            Nationwide Network
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">We cover every mile.</h2>
          <p className="text-slate-500 max-w-2xl mx-auto mb-16">
            From coast to coast, our carrier network spans all 50 states. Live tracking of our active hubs and capacity.
          </p>

          <div className="relative w-full max-w-5xl mx-auto aspect-[16/9] flex items-center justify-center p-4">
            <div className="relative w-full h-full">
               {/* Map Image */}
               <img 
                src="https://upload.wikimedia.org/wikipedia/commons/1/1a/Blank_US_Map_%28states_only%29.svg" 
                alt="US Coverage Map" 
                className="w-full h-full object-contain opacity-70 contrast-125 drop-shadow-md"
              />
              
              {/* SVG Overlay for Connections */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                   <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(79, 70, 229, 0)" />
                    <stop offset="50%" stopColor="rgba(79, 70, 229, 0.5)" />
                    <stop offset="100%" stopColor="rgba(79, 70, 229, 0)" />
                  </linearGradient>
                </defs>
                
                {/* Network Connections */}
                <g stroke="rgba(99, 102, 241, 0.3)" strokeWidth="0.2" fill="none">
                  {/* Seattle (12,12) Hub */}
                  <path d="M12,12 Q40,20 68,32" /> {/* Seattle -> Chicago */}
                  <path d="M12,12 Q10,32 10,52" /> {/* Seattle -> LA */}
                  <path d="M12,12 Q35,5 88,28" /> {/* Seattle -> NY */}

                  {/* LA (10,52) Hub */}
                  <path d="M10,52 Q30,65 50,65" stroke="url(#lineGradient)" strokeWidth="0.3" /> {/* LA -> Dallas (Highlighted) */}
                  <path d="M10,52 Q40,40 68,32" /> {/* LA -> Chicago */}
                  <path d="M10,52 Q45,55 78,55" /> {/* LA -> Atlanta */}

                  {/* Chicago (68,32) Hub */}
                  <path d="M68,32 L88,28" /> {/* Chicago -> NY */}
                  <path d="M68,32 Q75,45 78,55" /> {/* Chicago -> Atlanta */}
                  <path d="M68,32 Q60,50 50,65" /> {/* Chicago -> Dallas */}

                  {/* Dallas (50,65) Hub */}
                  <path d="M50,65 L78,55" /> {/* Dallas -> Atlanta */}
                  <path d="M50,65 Q70,50 88,28" /> {/* Dallas -> NY */}

                  {/* Atlanta (78,55) Hub */}
                  <path d="M78,55 L88,28" /> {/* Atlanta -> NY */}
                </g>
              </svg>

              {/* Pulsating Hotspots (Interactive Feel) */}
              
              {/* New York / Northeast */}
              <div className="absolute top-[28%] left-[88%] group">
                 <div className="absolute -inset-2 bg-indigo-500/20 rounded-full animate-ping"></div>
                 <div className="relative w-3 h-3 bg-indigo-600 rounded-full border border-white shadow-lg cursor-pointer hover:scale-125 transition-transform"></div>
                 <div className="absolute left-1/2 -translate-x-1/2 -top-8 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">New York Hub</div>
              </div>

              {/* Los Angeles / West Coast */}
              <div className="absolute top-[52%] left-[10%] group">
                 <div className="absolute -inset-2 bg-indigo-500/20 rounded-full animate-ping delay-300"></div>
                 <div className="relative w-3 h-3 bg-indigo-600 rounded-full border border-white shadow-lg cursor-pointer hover:scale-125 transition-transform"></div>
                 <div className="absolute left-1/2 -translate-x-1/2 -top-8 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">Los Angeles Hub</div>
              </div>

               {/* Chicago / Midwest */}
               <div className="absolute top-[32%] left-[68%] group">
                 <div className="absolute -inset-2 bg-indigo-500/20 rounded-full animate-ping delay-500"></div>
                 <div className="relative w-3 h-3 bg-indigo-600 rounded-full border border-white shadow-lg cursor-pointer hover:scale-125 transition-transform"></div>
                 <div className="absolute left-1/2 -translate-x-1/2 -top-8 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">Chicago Hub</div>
              </div>

               {/* Dallas / South */}
               <div className="absolute top-[65%] left-[50%] group">
                 <div className="absolute -inset-2 bg-indigo-500/20 rounded-full animate-ping delay-700"></div>
                 <div className="relative w-3 h-3 bg-indigo-600 rounded-full border border-white shadow-lg cursor-pointer hover:scale-125 transition-transform"></div>
                 <div className="absolute left-1/2 -translate-x-1/2 -top-8 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">Dallas Hub</div>
              </div>

               {/* Atlanta / Southeast */}
               <div className="absolute top-[55%] left-[78%] group">
                 <div className="absolute -inset-2 bg-indigo-500/20 rounded-full animate-ping delay-1000"></div>
                 <div className="relative w-3 h-3 bg-indigo-600 rounded-full border border-white shadow-lg cursor-pointer hover:scale-125 transition-transform"></div>
                 <div className="absolute left-1/2 -translate-x-1/2 -top-8 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">Atlanta Hub</div>
              </div>

               {/* Seattle / Northwest */}
               <div className="absolute top-[12%] left-[12%] group">
                 <div className="absolute -inset-2 bg-indigo-500/20 rounded-full animate-ping delay-200"></div>
                 <div className="relative w-3 h-3 bg-indigo-600 rounded-full border border-white shadow-lg cursor-pointer hover:scale-125 transition-transform"></div>
                 <div className="absolute left-1/2 -translate-x-1/2 -top-8 bg-slate-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">Seattle Hub</div>
              </div>
            </div>
            
          </div>
        </div>
      </section>

      {/* Trust Signals Section */}
      <section className="relative z-10 py-24 px-4 text-center">
        <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-10">Trusted by modern shipping teams</p>
        <div className="flex flex-wrap justify-center items-center gap-12 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
          {/* Logo Placeholders */}
          <div className="text-2xl font-bold text-slate-600 font-sans tracking-tight flex items-center gap-2"><div className="w-6 h-6 bg-slate-400 rounded-full"></div>ACME Corp</div>
          <div className="text-2xl font-bold text-slate-600 font-serif italic flex items-center gap-2"><div className="w-6 h-6 bg-slate-400 rounded-sm"></div>Globex</div>
          <div className="text-2xl font-bold text-slate-600 tracking-tighter flex items-center gap-2"><div className="w-6 h-6 bg-slate-400 rotate-45"></div>Soylent</div>
          <div className="text-2xl font-bold text-slate-600 font-mono flex items-center gap-2"><div className="w-6 h-6 bg-slate-400 rounded-lg"></div>Massive</div>
          <div className="text-2xl font-bold text-slate-600 flex items-center gap-2"><div className="w-6 h-6 bg-slate-400 rounded-full border-2 border-slate-300"></div>Umbrella</div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-200 bg-white/50 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <img 
              src="/logo.png" 
              alt="Lanely" 
              className="h-6 w-auto grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all duration-300" 
            />
          </div>
          <p className="text-sm text-slate-500">
            © {new Date().getFullYear()} Lanely Logistics, Inc. All rights reserved.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-slate-400 hover:text-indigo-600 transition-colors">Privacy</a>
            <a href="#" className="text-slate-400 hover:text-indigo-600 transition-colors">Terms</a>
            <a href="#" className="text-slate-400 hover:text-indigo-600 transition-colors">Twitter</a>
          </div>
        </div>
      </footer>
    </div>
  );
};