var express = require('express');
var router = express.Router();
var db = require('../db');

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

// Upcoming active queue: join queue with loads for details
router.get('/', async function(req, res, next) {
  try {
    var sql =
      `SELECT
        l.*,
        q.delivery_date AS delivery_date,
        q.status AS queue_status,
        q.priority AS queue_priority,
        q.created_at AS queue_created_at
      FROM load_queue q
      JOIN loads l ON l.load_number = q.load_number
      WHERE q.status IN ('queued','in_progress') AND q.delivery_date >= CURRENT_DATE
      ORDER BY q.delivery_date ASC, q.priority DESC, q.created_at ASC`;
    var result = await db.query(sql);
    var mapped = result.rows.map(toClientRow);
    res.json(mapped);
  } catch (err) {
    next(err);
  }
});

module.exports = router;


