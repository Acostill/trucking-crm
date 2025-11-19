import React, { useState } from 'react';
import './new-load-modal.css';

function NewLoadModal({ onClose, onSave }) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(() => {
    const formatDate = (d) => d.toISOString().slice(0, 10);
    const today = new Date();
    const inTwoDays = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000);

    return {
      customer: 'Customer 1',
      loadNumber: '1001',
      billTo: 'Acme Corp',
      dispatcher: 'Dispatcher 1',
      status: 'Open',
      type: 'Line Haul',
      rate: '1500',
      currency: 'USD',
      carrierOrDriver: 'Carrier',
      equipmentType: "53' Dry Van",
      shipper: 'Shipper 1',
      shipperLocation: 'Origin City, ST',
      shipDate: formatDate(today),
      showShipTime: true,
      description: 'Pallets',
      qty: '1',
      weight: '2000',
      value: '0',
      consignee: 'Consignee 1',
      consigneeLocation: 'Destination City, ST',
      deliveryDate: formatDate(inTwoDays),
      showDeliveryTime: true,
      deliveryNotes: 'Call on arrival'
    };
  });

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setSubmitting(true);
      if (onSave) {
        await onSave(form);
      }
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-header">
          <h3>New Active Load</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-body">
          <fieldset className="section">
            <legend>Customer</legend>
            <div className="grid two">
              <label>
                Customer
                <input name="customer" value={form.customer} onChange={handleChange} />
              </label>
            </div>
          </fieldset>

          <fieldset className="section">
            <legend>Load Information</legend>
            <div className="grid four">
              <label>
                Load #
                <input name="loadNumber" value={form.loadNumber} onChange={handleChange} />
              </label>
              <label>
                Bill To
                <input name="billTo" value={form.billTo} onChange={handleChange} />
              </label>
              <label>
                Dispatcher
                <input name="dispatcher" value={form.dispatcher} onChange={handleChange} />
              </label>
              <label>
                Status
                <select name="status" value={form.status} onChange={handleChange}>
                  <option>Open</option>
                  <option>Pending</option>
                  <option>Closed</option>
                </select>
              </label>
            </div>
            <div className="grid four">
              <label>
                Type
                <input name="type" value={form.type} onChange={handleChange} />
              </label>
              <label>
                Rate
                <input name="rate" value={form.rate} onChange={handleChange} type="number" step="0.01" />
              </label>
              <label>
                Currency
                <select name="currency" value={form.currency} onChange={handleChange}>
                  <option>USD</option>
                  <option>CAD</option>
                  <option>MXN</option>
                </select>
              </label>
              <label>
                Equipment Type
                <input name="equipmentType" value={form.equipmentType} onChange={handleChange} />
              </label>
            </div>
            <div className="grid two">
              <label>
                Carrier or Driver
                <select name="carrierOrDriver" value={form.carrierOrDriver} onChange={handleChange}>
                  <option>Carrier</option>
                  <option>Driver</option>
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="section">
            <legend>Shipper</legend>
            <div className="grid three">
              <label>
                Shipper
                <input name="shipper" value={form.shipper} onChange={handleChange} />
              </label>
              <label>
                Location
                <input name="shipperLocation" value={form.shipperLocation} onChange={handleChange} />
              </label>
              <label>
                Date
                <input name="shipDate" value={form.shipDate} onChange={handleChange} type="date" />
              </label>
            </div>
            <div className="grid four">
              <label className="checkbox">
                <input name="showShipTime" checked={form.showShipTime} onChange={handleChange} type="checkbox" />
                Show Time
              </label>
              <label>
                Description
                <input name="description" value={form.description} onChange={handleChange} />
              </label>
              <label>
                Qty
                <input name="qty" value={form.qty} onChange={handleChange} type="number" />
              </label>
              <label>
                Weight (lbs)
                <input name="weight" value={form.weight} onChange={handleChange} type="number" step="0.01" />
              </label>
              <label>
                Value ($)
                <input name="value" value={form.value} onChange={handleChange} type="number" step="0.01" />
              </label>
            </div>
          </fieldset>

          <fieldset className="section">
            <legend>Consignee</legend>
            <div className="grid three">
              <label>
                Consignee
                <input name="consignee" value={form.consignee} onChange={handleChange} />
              </label>
              <label>
                Location
                <input name="consigneeLocation" value={form.consigneeLocation} onChange={handleChange} />
              </label>
              <label>
                Date
                <input name="deliveryDate" value={form.deliveryDate} onChange={handleChange} type="date" />
              </label>
            </div>
            <div className="grid two">
              <label className="checkbox">
                <input name="showDeliveryTime" checked={form.showDeliveryTime} onChange={handleChange} type="checkbox" />
                Show Time
              </label>
              <label>
                Delivery Notes
                <input name="deliveryNotes" value={form.deliveryNotes} onChange={handleChange} />
              </label>
            </div>
          </fieldset>

          <div className="modal-footer">
            <button type="button" className="secondary" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default NewLoadModal;


