import React from 'react';
import { X, MapPin, Package, Calendar, DollarSign, FileText } from 'lucide-react';

interface CreateShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: string;
}

export const CreateShipmentModal: React.FC<CreateShipmentModalProps> = ({ isOpen, onClose, initialData }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-gray-900/20 backdrop-blur-sm transition-opacity animate-in fade-in duration-300" 
        onClick={onClose}
      />
      
      {/* Slide-over Panel */}
      <div className="relative w-full max-w-2xl bg-white h-full shadow-2xl p-8 overflow-y-auto animate-in slide-in-from-right duration-300 flex flex-col">
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors"
        >
          <X size={20} />
        </button>

        <h2 className="text-2xl font-semibold text-gray-900 mb-2">New Quote Request</h2>
        <p className="text-gray-500 mb-8">Review details and create a new shipment record.</p>

        <div className="space-y-8 flex-1">
          {/* Customer Section */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-[1px] bg-gray-300"></span> Customer Information
            </h3>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all placeholder:text-gray-400" 
                  placeholder="Search customer..." 
                  autoFocus
                />
              </div>
            </div>
          </section>

          {/* Route Section */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-[1px] bg-gray-300"></span> Route Details
            </h3>
            <div className="grid grid-cols-2 gap-5">
               <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Origin</label>
                <div className="relative">
                  <MapPin size={18} className="absolute left-3.5 top-3 text-gray-400" />
                  <input type="text" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all" placeholder="City, State or Zip" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Destination</label>
                <div className="relative">
                  <MapPin size={18} className="absolute left-3.5 top-3 text-gray-400" />
                  <input type="text" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all" placeholder="City, State or Zip" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Pickup Date</label>
                <div className="relative">
                  <Calendar size={18} className="absolute left-3.5 top-3 text-gray-400" />
                  <input type="date" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all text-gray-600" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Delivery Date</label>
                <div className="relative">
                  <Calendar size={18} className="absolute left-3.5 top-3 text-gray-400" />
                  <input type="date" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all text-gray-600" />
                </div>
              </div>
            </div>
          </section>

          {/* Cargo Section */}
          <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-[1px] bg-gray-300"></span> Cargo Details
            </h3>
             <div className="grid grid-cols-2 gap-5">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Commodity</label>
                <div className="relative">
                  <Package size={18} className="absolute left-3.5 top-3 text-gray-400" />
                  <input type="text" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all" placeholder="e.g. Electronics, Pallets" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Weight (lbs)</label>
                <input type="number" className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all" placeholder="0" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Equipment Type</label>
                 <select className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all text-gray-600 appearance-none bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%236b7280%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_1rem_center] bg-no-repeat">
                    <option>Dry Van</option>
                    <option>Reefer</option>
                    <option>Flatbed</option>
                    <option>Power Only</option>
                 </select>
              </div>
            </div>
          </section>

          {/* Financials (Initial Target) */}
           <section>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-[1px] bg-gray-300"></span> Target Rate
            </h3>
            <div className="grid grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Target to Cust.</label>
                <div className="relative">
                  <DollarSign size={18} className="absolute left-3.5 top-3 text-gray-400" />
                  <input type="number" className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all" placeholder="0.00" />
                </div>
              </div>
            </div>
          </section>

          {/* Raw Text / Notes */}
          <section>
             <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-[1px] bg-gray-300"></span> Notes / Raw Import
            </h3>
             <div className="relative">
                <FileText size={18} className="absolute left-3.5 top-3 text-gray-400" />
                <textarea 
                  className="w-full pl-11 pr-4 py-3 bg-indigo-50/30 border border-indigo-100 rounded-xl focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 focus:outline-none transition-all min-h-[120px] text-sm text-gray-600 leading-relaxed"
                  defaultValue={initialData}
                  placeholder="Additional notes..."
                />
             </div>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white pt-6 pb-2 mt-4 border-t border-gray-100 flex justify-between items-center z-10">
            <span className="text-xs text-gray-400 italic">Press ESC to close</span>
            <div className="flex gap-3">
              <button 
                onClick={onClose}
                className="px-6 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={onClose}
                className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-colors"
              >
                Create Quote
              </button>
            </div>
        </div>
      </div>
    </div>
  );
};