import React from 'react';
import { ShipmentStatus } from '../../types';

interface BadgeProps {
  status: ShipmentStatus | string;
}

export const Badge: React.FC<BadgeProps> = ({ status }) => {
  const getStyle = (s: string) => {
    switch (s) {
      case 'New Quote':
        return 'bg-gray-100 text-gray-600 border-gray-200';
      case 'Quoted':
        return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'Booked':
        return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'In Transit':
        return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'Delivered':
        return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'Invoiced':
        return 'bg-purple-50 text-purple-600 border-purple-100';
      case 'Paid':
        return 'bg-teal-50 text-teal-600 border-teal-100';
      default:
        return 'bg-gray-50 text-gray-500 border-gray-100';
    }
  };

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStyle(status)}`}>
      {status}
    </span>
  );
};
