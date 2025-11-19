var express = require('express');
var router = express.Router();
var db = require('../db');

function pickLoad(input) {
  // Whitelist fields we accept from the client
  var out = {
    customer: input.customer,
    load_number: input.loadNumber,
    bill_to: input.billTo,
    dispatcher: input.dispatcher,
    status: input.status,
    type: input.type,
    rate: input.rate,
    currency: input.currency,
    carrier_or_driver: input.carrierOrDriver,
    equipment_type: input.equipmentType,
    shipper: input.shipper,
    shipper_location: input.shipperLocation,
    ship_date: input.shipDate || null,
    show_ship_time: input.showShipTime,
    description: input.description,
    qty: input.qty,
    weight: input.weight,
    value: input.value,
    consignee: input.consignee,
    consignee_location: input.consigneeLocation,
    delivery_date: input.deliveryDate || null,
    show_delivery_time: input.showDeliveryTime,
    delivery_notes: input.deliveryNotes
  };
  return out;
}

function toClientRow(row) {
  return {
    customer: row.customer,
    loadNumber: row.load_number,
    billTo: row.bill_to,
    dispatcher: row.dispatcher,
    status: row.status,
    type: row.type,
    rate: row.rate,
    currency: row.currency,
    equipmentType: row.equipment_type,
    shipper: row.shipper,
    shipperLocation: row.shipper_location,
    shipDate: row.ship_date,
    consignee: row.consignee,
    consigneeLocation: row.consignee_location,
    deliveryDate: row.delivery_date
  };
}

router.get('/', async function(req, res, next) {
  try {
    var result = await db.query('SELECT * FROM loads ORDER BY created_at DESC');
    var mapped = result.rows.map(toClientRow);
    res.json(mapped);
  } catch (err) {
    next(err);
  }
});

router.post('/', async function(req, res, next) {
  try {
    var data = pickLoad(req.body || {});
    var insert =
      'INSERT INTO loads ' +
      '(customer, load_number, bill_to, dispatcher, status, type, rate, currency, carrier_or_driver, equipment_type, shipper, shipper_location, ship_date, show_ship_time, description, qty, weight, value, consignee, consignee_location, delivery_date, show_delivery_time, delivery_notes) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) ' +
      'RETURNING *';
    var params = [
      data.customer,
      data.load_number,
      data.bill_to,
      data.dispatcher,
      data.status,
      data.type,
      data.rate,
      data.currency,
      data.carrier_or_driver,
      data.equipment_type,
      data.shipper,
      data.shipper_location,
      data.ship_date,
      data.show_ship_time,
      data.description,
      data.qty,
      data.weight,
      data.value,
      data.consignee,
      data.consignee_location,
      data.delivery_date,
      data.show_delivery_time,
      data.delivery_notes
    ];
    var result = await db.query(insert, params);
    res.status(201).json(toClientRow(result.rows[0]));
  } catch (err) {
    // Handle unique violations on load_number gracefully
    if (err && err.code === '23505') {
      res.status(409).json({ error: 'Load number already exists' });
      return;
    }
    next(err);
  }
});

module.exports = router;


