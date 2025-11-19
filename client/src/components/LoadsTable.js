import React from 'react';

function LoadsTable({ rows }) {
  if (!rows.length) {
    return (
      <div style={{ marginTop: 24, textAlign: 'left' }}>
        No loads yet. Click "New Active Load" to add one.
      </div>
    );
  }

  return (
    <div className="table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Customer</th>
            <th>Load #</th>
            <th>Bill To</th>
            <th>Dispatcher</th>
            <th>Status</th>
            <th>Type</th>
            <th>Rate</th>
            <th>Currency</th>
            <th>Equipment</th>
            <th>Shipper</th>
            <th>Shipper Location</th>
            <th>Ship Date</th>
            <th>Consignee</th>
            <th>Consignee Location</th>
            <th>Delivery Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx}>
              <td>{r.customer}</td>
              <td>{r.loadNumber}</td>
              <td>{r.billTo}</td>
              <td>{r.dispatcher}</td>
              <td>{r.status}</td>
              <td>{r.type}</td>
              <td>{r.rate}</td>
              <td>{r.currency}</td>
              <td>{r.equipmentType}</td>
              <td>{r.shipper}</td>
              <td>{r.shipperLocation}</td>
              <td>{r.shipDate}</td>
              <td>{r.consignee}</td>
              <td>{r.consigneeLocation}</td>
              <td>{r.deliveryDate}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default LoadsTable;


