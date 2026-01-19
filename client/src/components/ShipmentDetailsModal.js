import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import StatusBadge from './StatusBadge';

const STATUS_OPTIONS = [
  'New Quote',
  'Quoted',
  'Booked',
  'Pending',
  'In Transit',
  'Delivered',
  'Invoiced',
  'Paid'
];

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { 
      year: 'numeric',
      month: 'long', 
      day: 'numeric' 
    });
  } catch {
    return dateStr;
  }
}

export default function ShipmentDetailsModal({ shipment, onClose, onSave }) {
  const [status, setStatus] = useState('Pending');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [description, setDescription] = useState('');
  const [customer, setCustomer] = useState('');
  const [type, setType] = useState('');
  const [rate, setRate] = useState('');
  const [equipmentType, setEquipmentType] = useState('');
  const [shipper, setShipper] = useState('');
  const [shipperLocation, setShipperLocation] = useState('');
  const [shipDate, setShipDate] = useState('');
  const [consignee, setConsignee] = useState('');
  const [consigneeLocation, setConsigneeLocation] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!shipment) return;
    setStatus(shipment.status || 'Pending');
    setDeliveryNotes(shipment.deliveryNotes || '');
    setDescription(shipment.description || '');
    setCustomer(shipment.customer || '');
    setType(shipment.type || '');
    setRate(shipment.rate != null ? String(shipment.rate) : '');
    setEquipmentType(shipment.equipmentType || '');
    setShipper(shipment.shipper || '');
    setShipperLocation(shipment.shipperLocation || '');
    setShipDate(shipment.shipDate || '');
    setConsignee(shipment.consignee || '');
    setConsigneeLocation(shipment.consigneeLocation || '');
    setDeliveryDate(shipment.deliveryDate || '');
    setError('');
    setSaved(false);
    setDirty(false);
  }, [shipment]);

  if (!shipment) return null;

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    setError('');
    try {
      await onSave({
        id: shipment.id,
        status,
        deliveryNotes,
        description,
        customer,
        type,
        rate: rate === '' ? null : Number(rate),
        equipmentType,
        shipper,
        shipperLocation,
        shipDate: shipDate || null,
        consignee,
        consigneeLocation,
        deliveryDate: deliveryDate || null
      });
      setSaved(true);
      setDirty(false);
    } catch (err) {
      setError(err && err.message ? err.message : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="shipment-details-title">
      <div className="modal shipment-details-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div id="shipment-details-title" className="modal-title">
              Shipment Details
            </div>
            <div className="modal-subtitle">
              Load #{shipment.loadNumber || 'N/A'}
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="modal-body">
          <div className="shipment-details-content">
            {/* Status Section */}
            <div className="shipment-details-section">
              <h3 className="shipment-details-section-title">Status</h3>
              <div className="shipment-details-status">
                <StatusBadge status={status || 'Pending'} />
              </div>
              <div className="modal-form">
                <label>
                  Update Status
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {/* Notes Section */}
            <div className="shipment-details-section">
              <h3 className="shipment-details-section-title">Delivery Notes</h3>
              <div className="modal-form">
                <label>
                  Notes
                  <textarea
                    rows={4}
                    value={deliveryNotes}
                    onChange={(e) => {
                      setDeliveryNotes(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                    placeholder="Add delivery notes..."
                  />
                </label>
              </div>
            </div>

            {/* Description Section */}
            <div className="shipment-details-section">
              <h3 className="shipment-details-section-title">Description</h3>
              <div className="modal-form">
                <label>
                  Description
                  <input
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                    placeholder="Add a description..."
                  />
                </label>
              </div>
            </div>

            {/* Additional Details */}
            <div className="shipment-details-section">
              <h3 className="shipment-details-section-title">Shipment Information</h3>
              <div className="modal-form shipment-details-grid">
                <label>
                  Customer
                  <input
                    value={customer}
                    onChange={(e) => {
                      setCustomer(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Type
                  <input
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Rate
                  <input
                    type="number"
                    step="0.01"
                    value={rate}
                    onChange={(e) => {
                      setRate(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Equipment
                  <input
                    value={equipmentType}
                    onChange={(e) => {
                      setEquipmentType(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Shipper
                  <input
                    value={shipper}
                    onChange={(e) => {
                      setShipper(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Shipper Location
                  <input
                    value={shipperLocation}
                    onChange={(e) => {
                      setShipperLocation(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Ship Date
                  <input
                    type="date"
                    value={shipDate ? String(shipDate).slice(0, 10) : ''}
                    onChange={(e) => {
                      setShipDate(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Consignee
                  <input
                    value={consignee}
                    onChange={(e) => {
                      setConsignee(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Consignee Location
                  <input
                    value={consigneeLocation}
                    onChange={(e) => {
                      setConsigneeLocation(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                  />
                </label>
                <label>
                  Delivery Date
                  <input
                    type="date"
                    value={deliveryDate ? String(deliveryDate).slice(0, 10) : ''}
                    onChange={(e) => {
                      setDeliveryDate(e.target.value);
                      setSaved(false);
                      setDirty(true);
                    }}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-actions">
          {error && <div className="error">{error}</div>}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="btn" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

