import express, { Request, Response, NextFunction } from 'express';
import db from '../db';
import { getUserIdFromRequest } from '../utils/auth';

const router = express.Router();

function pickLoad(input: any) {
  return {
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
}

function toClientRow(row: any) {
  return {
    id: row.id,
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
    deliveryDate: row.delivery_date,
    deliveryNotes: row.delivery_notes,
    description: row.description
  };
}

router.get('/', async function(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await db.query('SELECT * FROM loads ORDER BY created_at DESC');
    const mapped = result.rows.map(toClientRow);
    res.json(mapped);
  } catch (err) {
    next(err);
  }
});

router.post('/', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = await getUserIdFromRequest(req);
    const data = pickLoad(req.body || {});
    const insert =
      'INSERT INTO loads ' +
      '(customer, load_number, bill_to, dispatcher, status, type, rate, currency, carrier_or_driver, equipment_type, shipper, shipper_location, ship_date, show_ship_time, description, qty, weight, value, consignee, consignee_location, delivery_date, show_delivery_time, delivery_notes) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) ' +
      'RETURNING *';
    const params = [
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
    const result = await db.queryWithUser(insert, params, userId || undefined);
    res.status(201).json(toClientRow(result.rows[0]));
  } catch (err: any) {
    if (err && err.code === '23505') {
      res.status(409).json({ error: 'Load number already exists' });
      return;
    }
    next(err);
  }
});

router.put('/:id', async function(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = await getUserIdFromRequest(req);
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid load id' });
      return;
    }

    const status = req.body?.status ?? null;
    const deliveryNotes = req.body?.deliveryNotes ?? null;
    const description = req.body?.description ?? null;
    const customer = req.body?.customer ?? null;
    const type = req.body?.type ?? null;
    const rate = req.body?.rate ?? null;
    const equipmentType = req.body?.equipmentType ?? null;
    const shipper = req.body?.shipper ?? null;
    const shipperLocation = req.body?.shipperLocation ?? null;
    const shipDate = req.body?.shipDate ?? null;
    const consignee = req.body?.consignee ?? null;
    const consigneeLocation = req.body?.consigneeLocation ?? null;
    const deliveryDate = req.body?.deliveryDate ?? null;

    const updateSql = `
      UPDATE loads
      SET status = COALESCE($2, status),
          delivery_notes = COALESCE($3, delivery_notes),
          description = COALESCE($4, description),
          customer = COALESCE($5, customer),
          type = COALESCE($6, type),
          rate = COALESCE($7, rate),
          equipment_type = COALESCE($8, equipment_type),
          shipper = COALESCE($9, shipper),
          shipper_location = COALESCE($10, shipper_location),
          ship_date = COALESCE($11, ship_date),
          consignee = COALESCE($12, consignee),
          consignee_location = COALESCE($13, consignee_location),
          delivery_date = COALESCE($14, delivery_date),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await db.queryWithUser(
      updateSql,
      [
        id,
        status,
        deliveryNotes,
        description,
        customer,
        type,
        rate,
        equipmentType,
        shipper,
        shipperLocation,
        shipDate,
        consignee,
        consigneeLocation,
        deliveryDate
      ],
      userId || undefined
    );
    if (!result.rows.length) {
      res.status(404).json({ error: 'Load not found' });
      return;
    }

    res.json(toClientRow(result.rows[0]));
  } catch (err) {
    next(err);
  }
});

export default router;

