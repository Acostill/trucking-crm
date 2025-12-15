import React, { useState } from 'react';
import { ArrowRight, AlertCircle, CheckCircle2, Sparkles, ClipboardPaste, ChevronRight } from 'lucide-react';
import { GlassCard } from './ui/GlassCard';
import { MOCK_SHIPMENTS } from '../constants';
import { Badge } from './ui/Badge';
import { CreateShipmentModal } from './CreateShipmentModal';

export const Dashboard: React.FC = () => {
  const activeShipments = MOCK_SHIPMENTS.filter(s => s.status === 'In Transit');
  const atRiskShipments = MOCK_SHIPMENTS.filter(s => s.status === 'New Quote');
  const openQuotes = MOCK_SHIPMENTS.filter(s => ['New Quote', 'Quoted'].includes(s.status));
  
  const [isQuoteModalOpen, setIsQuoteModalOpen] = useState(false);
  const [emailText, setEmailText] = useState('');

  // Minimalist KPI data structure matching the visual reference
  const kpis = [
    { 
      label: 'Active Shipments', 
      value: activeShipments.length.toString(), 
      trend: '+12.5%', 
      positive: true 
    },
    { 
      label: 'Open Quotes', 
      value: openQuotes.length.toString(), 
      trend: '+3.2%', 
      positive: true 
    },
    { 
      label: 'On-Time Rate', 
      value: '98.4%', 
      trend: '-0.4%', 
      positive: false 
    },
    { 
      label: 'Tasks Remaining', 
      value: '5', 
      trend: '-2', 
      positive: true 
    },
  ];

  const handleProcessQuote = () => {
    setIsQuoteModalOpen(true);
  };

  return (
    <>
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* Header */}
        <div className="flex justify-between items-end mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Good Morning, Alex</h1>
            <p className="text-gray-500 mt-1">Ready to move some freight?</p>
          </div>
          <div className="text-sm text-gray-400">
            Last updated: Just now
          </div>
        </div>

        {/* KPI Grid - Top of section, Icon-free, Reference Image Style */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi, idx) => (
            <GlassCard key={idx} className="flex flex-col justify-between h-[120px]">
              <div className="flex justify-between items-start">
                <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{kpi.label}</span>
                <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                  kpi.positive 
                    ? 'bg-emerald-50 text-emerald-600' 
                    : 'bg-rose-50 text-rose-600'
                }`}>
                  {kpi.trend}
                </span>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-900 tracking-tight">
                  {kpi.value}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {/* Quick Import / Email Section */}
        <GlassCard className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Sparkles size={120} className="text-indigo-400" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                <ClipboardPaste size={20} />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Quick Import</h3>
                <p className="text-xs text-gray-500">Paste load tender or email content to generate a quote.</p>
              </div>
            </div>
            
            <div className="relative">
              <textarea
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder="Paste email body here (e.g., 'Need a flatbed from Chicago to Austin...')"
                className="w-full h-24 p-4 bg-gray-50/50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all resize-none placeholder:text-gray-400 font-mono"
              />
              <div className="absolute bottom-3 right-3 flex gap-2">
                 <button 
                  onClick={() => setEmailText('')}
                  className={`text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 transition-opacity ${emailText ? 'opacity-100' : 'opacity-0'}`}
                 >
                   Clear
                 </button>
                 <button 
                    onClick={handleProcessQuote}
                    className="bg-indigo-600 text-white text-sm font-medium px-4 py-1.5 rounded-lg shadow-md shadow-indigo-200 hover:bg-indigo-700 transition-all flex items-center gap-2"
                 >
                   <Sparkles size={14} />
                   Process Quote
                 </button>
              </div>
            </div>
          </div>
        </GlassCard>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Open Quotes Table */}
          <div className="lg:col-span-2">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-900">Recent Quotes</h3>
                <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
                  View Pipeline <ChevronRight size={14} />
                </button>
              </div>
              
              <GlassCard noPadding className="flex flex-col overflow-hidden">
                <div className="overflow-y-auto max-h-[400px]">
                  <table className="w-full text-sm text-left border-collapse">
                    <thead className="bg-gray-50/95 backdrop-blur-sm text-gray-500 font-medium border-b border-gray-200 sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                      <tr>
                        <th className="px-6 py-4 whitespace-nowrap">ID</th>
                        <th className="px-6 py-4 whitespace-nowrap">Customer</th>
                        <th className="px-6 py-4 whitespace-nowrap">Route</th>
                        <th className="px-6 py-4 whitespace-nowrap">Status</th>
                        <th className="px-6 py-4 text-right whitespace-nowrap">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {openQuotes.length > 0 ? openQuotes.slice(0, 5).map((s) => (
                        <tr key={s.id} className="hover:bg-gray-50 transition-colors cursor-pointer group">
                          <td className="px-6 py-4 font-medium text-gray-900">{s.trackingId}</td>
                          <td className="px-6 py-4 text-gray-600">{s.customer.name}</td>
                          <td className="px-6 py-4 text-gray-500 flex items-center gap-2">
                            {s.origin.split(',')[0]} 
                            <ArrowRight size={12} className="text-gray-300 group-hover:text-indigo-400" /> 
                            {s.destination.split(',')[0]}
                          </td>
                          <td className="px-6 py-4">
                            <Badge status={s.status} />
                          </td>
                          <td className="px-6 py-4 text-right">
                             <button className="text-xs font-medium text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-100">
                               Review
                             </button>
                          </td>
                        </tr>
                      )) : (
                         <tr>
                            <td colSpan={5} className="px-6 py-12 text-center text-gray-400">No active quotes found.</td>
                         </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </GlassCard>
          </div>

          {/* Action Items Feed */}
          <div className="lg:col-span-1">
            <GlassCard className="h-full flex flex-col max-h-[500px]">
              <div className="flex items-center justify-between mb-4">
                 <div className="flex items-center gap-2">
                    <AlertCircle size={18} className="text-amber-500" />
                    <h3 className="font-semibold text-gray-900">Tasks</h3>
                 </div>
                 <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">5 Pending</span>
              </div>
              
              <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                 <div className="p-3 rounded-xl bg-white border border-gray-100 shadow-sm flex gap-3 items-start hover:border-indigo-200 transition-colors cursor-pointer group">
                  <div className="mt-1.5 w-2 h-2 rounded-full bg-rose-500 shrink-0 group-hover:scale-110 transition-transform" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Carrier Falloff - LNY-8392</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Needs recovery option ASAP.
                    </div>
                  </div>
                </div>

                {atRiskShipments.slice(0, 2).map(item => (
                  <div key={item.id} className="p-3 rounded-xl bg-amber-50/30 border border-amber-100 flex gap-3 items-start group hover:bg-amber-50 transition-colors cursor-pointer">
                    <div className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        Send Quote: {item.customer.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {item.origin.split(',')[0]} to {item.destination.split(',')[0]}
                      </div>
                    </div>
                  </div>
                ))}
                
                 <div className="p-3 rounded-xl bg-white border border-gray-100 shadow-sm flex gap-3 items-start hover:border-indigo-200 transition-colors cursor-pointer">
                  <CheckCircle2 size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-sm font-medium text-gray-900">Update Delivery Status</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Confirm delivery for LNY-9921
                    </div>
                  </div>
                </div>
              </div>
              
              <button className="w-full mt-4 py-2 text-sm text-gray-500 hover:text-indigo-600 font-medium border border-dashed border-gray-200 hover:border-indigo-200 rounded-lg transition-colors flex items-center justify-center gap-2">
                   + Add New Task
              </button>
            </GlassCard>
          </div>
        </div>

        {/* Active Shipments Table */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-900">Active Shipments (In Transit)</h3>
            <button className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
              View All Shipments <ChevronRight size={14} />
            </button>
          </div>
          
          <GlassCard noPadding className="overflow-hidden">
            <div className="overflow-y-auto max-h-[400px]">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-gray-50/95 backdrop-blur-sm text-gray-500 font-medium border-b border-gray-200 sticky top-0 z-10 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                  <tr>
                    <th className="px-6 py-4 whitespace-nowrap">ID</th>
                    <th className="px-6 py-4 whitespace-nowrap">Customer</th>
                    <th className="px-6 py-4 whitespace-nowrap">Route</th>
                    <th className="px-6 py-4 whitespace-nowrap">Status</th>
                    <th className="px-6 py-4 text-right whitespace-nowrap">ETA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {activeShipments.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50 transition-colors cursor-pointer group">
                      <td className="px-6 py-4 font-medium text-gray-900">{s.trackingId}</td>
                      <td className="px-6 py-4 text-gray-600">{s.customer.name}</td>
                      <td className="px-6 py-4 text-gray-500 flex items-center gap-2">
                        {s.origin.split(',')[0]} 
                        <ArrowRight size={12} className="text-gray-300 group-hover:text-indigo-400" /> 
                        {s.destination.split(',')[0]}
                      </td>
                      <td className="px-6 py-4">
                        <Badge status={s.status} />
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-gray-600">
                        {s.deliveryDate}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </div>
      </div>
      
      {/* Create Shipment Modal */}
      <CreateShipmentModal 
        isOpen={isQuoteModalOpen} 
        onClose={() => setIsQuoteModalOpen(false)} 
        initialData={emailText}
      />
    </>
  );
};