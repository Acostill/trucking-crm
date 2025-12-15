import React, { useState } from 'react';
import { MOCK_SHIPMENTS } from '../constants';
import { Badge } from './ui/Badge';
import { GlassCard } from './ui/GlassCard';
import { Search, Filter, Download, ChevronDown, MoreVertical } from 'lucide-react';

export const ShipmentList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = MOCK_SHIPMENTS.filter(s => 
    s.trackingId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.customer.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="animate-in fade-in duration-500 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">All Shipments</h1>
          <p className="text-sm text-gray-500 mt-1">View and manage your freight history.</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-colors">
            <Download size={16} /> Export
          </button>
          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-colors">
            Create Shipment
          </button>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search by ID, Customer..." 
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-colors">
          <Filter size={16} /> Filters <ChevronDown size={14} />
        </button>
      </div>

      <GlassCard noPadding className="overflow-hidden min-h-[500px]">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50/50 text-gray-500 font-medium border-b border-gray-100">
            <tr>
              <th className="px-6 py-4 w-10"><input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></th>
              <th className="px-6 py-4">Tracking ID</th>
              <th className="px-6 py-4">Customer</th>
              <th className="px-6 py-4">Origin</th>
              <th className="px-6 py-4">Destination</th>
              <th className="px-6 py-4">Dates</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4 text-right">Revenue</th>
              <th className="px-6 py-4 w-10"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50/80 transition-colors group">
                <td className="px-6 py-4"><input type="checkbox" className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></td>
                <td className="px-6 py-4 font-medium text-gray-900">{s.trackingId}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold">
                      {s.customer.name.charAt(0)}
                    </div>
                    <span className="text-gray-700">{s.customer.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-600">{s.origin}</td>
                <td className="px-6 py-4 text-gray-600">{s.destination}</td>
                <td className="px-6 py-4 text-gray-500 text-xs">
                  <div>Pk: {s.pickupDate}</div>
                  <div>Del: {s.deliveryDate}</div>
                </td>
                <td className="px-6 py-4">
                  <Badge status={s.status} />
                </td>
                <td className="px-6 py-4 text-right font-medium text-gray-900">
                  ${s.revenue.toLocaleString()}
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    <MoreVertical size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-12 text-center text-gray-400">
            No shipments found matching your search.
          </div>
        )}
      </GlassCard>
    </div>
  );
};
