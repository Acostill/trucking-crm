import React from 'react';
import { MOCK_SHIPMENTS, PIPELINE_STAGES } from '../constants';
import { Badge } from './ui/Badge';
import { MoreHorizontal, Plus } from 'lucide-react';
import { Shipment } from '../types';

const PipelineCard: React.FC<{ shipment: Shipment }> = ({ shipment }) => (
  <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-3 hover:shadow-md hover:border-indigo-100 transition-all cursor-grab active:cursor-grabbing group relative">
    <div className="flex justify-between items-start mb-2">
      <span className="text-xs font-semibold text-gray-900 bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
        {shipment.trackingId}
      </span>
      <button className="text-gray-300 hover:text-gray-600">
        <MoreHorizontal size={14} />
      </button>
    </div>
    <h4 className="text-sm font-medium text-gray-900 mb-1 line-clamp-1">{shipment.customer.name}</h4>
    <div className="text-xs text-gray-500 mb-3 flex items-center gap-1">
      <span className="truncate max-w-[80px]">{shipment.origin.split(',')[0]}</span>
      <span className="text-gray-300">→</span>
      <span className="truncate max-w-[80px]">{shipment.destination.split(',')[0]}</span>
    </div>
    <div className="flex justify-between items-center pt-2 border-t border-gray-50">
      <span className="text-xs text-gray-400">{shipment.commodity}</span>
      <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
        ${shipment.revenue}
      </span>
    </div>
  </div>
);

export const Pipeline: React.FC = () => {
  // Group shipments by status
  const getShipmentsByStage = (stage: string) => {
    return MOCK_SHIPMENTS.filter(s => s.status === stage);
  };

  return (
    <div className="h-[calc(100vh-2rem)] flex flex-col animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-6 px-1">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500 mt-1">Manage deal flow and shipment progress.</p>
        </div>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg shadow-indigo-200 flex items-center gap-2 transition-all">
          <Plus size={16} />
          New Deal
        </button>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4 h-full min-w-max px-1">
          {PIPELINE_STAGES.map((stage) => {
             const items = getShipmentsByStage(stage);
             return (
              <div key={stage} className="w-72 flex flex-col h-full">
                <div className="flex justify-between items-center mb-3 px-1">
                  <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    {stage}
                    <span className="text-xs font-normal text-gray-400 bg-gray-100 px-1.5 rounded-full">{items.length}</span>
                  </h3>
                  <button className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded p-1 transition-colors">
                    <Plus size={14} />
                  </button>
                </div>
                
                <div className="flex-1 bg-gray-100/50 rounded-2xl p-2 overflow-y-auto">
                  {items.length > 0 ? (
                    items.map(shipment => <PipelineCard key={shipment.id} shipment={shipment} />)
                  ) : (
                    <div className="h-24 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-xl m-1">
                      <span className="text-xs text-gray-400 font-medium">No Shipments</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};