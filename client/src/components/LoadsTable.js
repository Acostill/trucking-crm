import React, { useState } from 'react';
import StatusBadge from './StatusBadge';
import { Search, Filter, Download, ChevronDown, MoreVertical, Plus } from 'lucide-react';
import ShipmentDetailsModal from './ShipmentDetailsModal';

function LoadsTable({ rows, onNewLoad, onUpdate }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  const filtered = rows.filter(r => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (r.loadNumber && r.loadNumber.toLowerCase().includes(term)) ||
      (r.customer && r.customer.toLowerCase().includes(term)) ||
      (r.shipper && r.shipper.toLowerCase().includes(term)) ||
      (r.consignee && r.consignee.toLowerCase().includes(term))
    );
  });

  function formatCurrency(value) {
    if (value === null || value === undefined) return '-';
    const num = Number(value);
    if (isNaN(num)) return '-';
    return '$' + num.toLocaleString();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  return (
    <div className="shipment-list">
      {/* Header */}
      <div className="shipment-list-header">
        <div>
          <h1 className="shipment-list-title">All Shipments</h1>
          <p className="shipment-list-subtitle">View and manage your freight history.</p>
        </div>
        <div className="shipment-list-actions">
          <button className="btn-export">
            <Download size={16} />
            Export
          </button>
          {onNewLoad && (
            <button className="btn-create" onClick={onNewLoad}>
              <Plus size={16} />
              Create Shipment
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="shipment-list-toolbar">
        <div className="shipment-search">
          <Search size={18} className="shipment-search-icon" />
          <input
            type="text"
            placeholder="Search by ID, Customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="btn-filter">
          <Filter size={16} />
          Filters
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Table */}
      <div className="shipment-table-card">
        {filtered.length === 0 ? (
          <div className="shipment-empty">
            {rows.length === 0 ? (
              <>
                <div className="shipment-empty-icon">📦</div>
                <h3>No shipments yet</h3>
                <p>Click "Create Shipment" to add your first load.</p>
              </>
            ) : (
              <>
                <div className="shipment-empty-icon">🔍</div>
                <h3>No results found</h3>
                <p>No shipments match your search criteria.</p>
              </>
            )}
          </div>
        ) : (
          <table className="shipment-table">
        <thead>
          <tr>
                <th className="th-checkbox">
                  <input type="checkbox" />
                </th>
                <th>Load #</th>
            <th>Customer</th>
                <th>Origin</th>
                <th>Destination</th>
                <th>Dates</th>
            <th>Status</th>
                <th className="th-right">Rate</th>
                <th className="th-actions"></th>
          </tr>
        </thead>
        <tbody>
              {filtered.map((r, idx) => (
                <tr 
                  key={r.id || idx}
                  className="shipment-table-row-clickable"
                  onClick={() => {
                    setSelectedShipment(r);
                    setIsDetailsModalOpen(true);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="td-checkbox" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" />
                  </td>
                  <td className="td-id">
                    {r.loadNumber || '-'}
                  </td>
                  <td>
                    <div className="customer-cell">
                      <div className="customer-avatar">
                        {r.customer ? r.customer.charAt(0).toUpperCase() : '?'}
                      </div>
                      <span className="customer-name">{r.customer || '-'}</span>
                    </div>
                  </td>
                  <td className="td-location">
                    {r.shipperLocation || r.shipper || '-'}
                  </td>
                  <td className="td-location">
                    {r.consigneeLocation || r.consignee || '-'}
                  </td>
                  <td className="td-dates">
                    <div>Pk: {formatDate(r.shipDate)}</div>
                    <div>Del: {formatDate(r.deliveryDate)}</div>
                  </td>
                  <td>
                    <StatusBadge status={r.status || 'Pending'} />
                  </td>
                  <td className="td-rate">
                    {formatCurrency(r.rate)}
                  </td>
                  <td className="td-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn-more">
                      <MoreVertical size={16} />
                    </button>
                  </td>
            </tr>
          ))}
        </tbody>
      </table>
        )}
      </div>

      {/* Shipment Details Modal */}
      {isDetailsModalOpen && (
        <ShipmentDetailsModal
          shipment={selectedShipment}
          onSave={async (updatedFields) => {
            if (!onUpdate) return;
            const updated = await onUpdate(updatedFields);
            setSelectedShipment(updated);
          }}
          onClose={() => {
            setIsDetailsModalOpen(false);
            setSelectedShipment(null);
          }}
        />
      )}
    </div>
  );
}

export default LoadsTable;
