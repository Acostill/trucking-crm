import React from 'react';

const STATUS_STYLES = {
  'Pending': 'status-badge-gray',
  'New Quote': 'status-badge-gray',
  'Quoted': 'status-badge-blue',
  'Booked': 'status-badge-indigo',
  'In Transit': 'status-badge-amber',
  'Delivered': 'status-badge-emerald',
  'Invoiced': 'status-badge-purple',
  'Paid': 'status-badge-teal',
  'Cancelled': 'status-badge-red',
};

function StatusBadge({ status }) {
  const styleClass = STATUS_STYLES[status] || 'status-badge-gray';
  
  return (
    <span className={`status-badge ${styleClass}`}>
      {status}
    </span>
  );
}

export default StatusBadge;

