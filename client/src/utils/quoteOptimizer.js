const EQUIPMENT_OPTIONS = [
  {
    id: 'ltl',
    label: 'LTL Freight',
    truckType: 'LTL',
    description: 'Shared trailer space for palletized freight',
    capacity: '1-6 pallets / up to 10,000 lb'
  },
  {
    id: 'sprinter',
    label: 'Sprinter Van',
    truckType: 'Sprinter Van',
    description: 'Fast, dedicated transport for compact freight',
    capacity: '1-2 pallets / up to 2,500 lb'
  },
  {
    id: 'box_truck',
    label: 'Box Truck',
    truckType: 'Box Truck',
    description: 'Dedicated regional capacity with dock flexibility',
    capacity: 'Up to 12 pallets / 12,000 lb'
  },
  {
    id: 'dry_van',
    label: "53' Dry Van",
    truckType: "53' Dry Van",
    description: 'Full trailer capacity for larger shipments',
    capacity: 'Up to 26 pallets / 45,000 lb'
  },
  {
    id: 'flatbed',
    label: 'Flatbed',
    truckType: 'Flatbed',
    description: 'Open-deck capacity for oversized or crane-loaded freight',
    capacity: 'Up to 48,000 lb / oversized capable'
  }
];

const STATE_CENTERS = {
  AL: [32.8, -86.8], AK: [64.2, -152.5], AZ: [34.3, -111.7], AR: [34.8, -92.2],
  CA: [37.2, -119.7], CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5],
  FL: [28.6, -82.4], GA: [32.7, -83.3], HI: [20.8, -157.5], ID: [44.2, -114.4],
  IL: [40.0, -89.2], IN: [39.9, -86.3], IA: [42.1, -93.5], KS: [38.5, -98.3],
  KY: [37.8, -85.8], LA: [31.0, -92.0], ME: [45.3, -69.0], MD: [39.0, -76.7],
  MA: [42.3, -71.8], MI: [44.3, -85.6], MN: [46.3, -94.2], MS: [32.7, -89.7],
  MO: [38.5, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8], NV: [39.3, -116.6],
  NH: [43.7, -71.6], NJ: [40.1, -74.7], NM: [34.4, -106.1], NY: [42.9, -75.5],
  NC: [35.5, -79.4], ND: [47.5, -100.5], OH: [40.3, -82.8], OK: [35.6, -97.5],
  OR: [44.0, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.5], SC: [33.8, -80.9],
  SD: [44.4, -100.2], TN: [35.8, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7],
  VT: [44.1, -72.7], VA: [37.5, -78.8], WA: [47.4, -120.7], WV: [38.6, -80.6],
  WI: [44.6, -89.8], WY: [43.0, -107.6], DC: [38.9, -77.0]
};

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeState(value) {
  return String(value || '').trim().toUpperCase().slice(0, 2);
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function estimateLaneMiles(originState, destinationState) {
  const originCode = normalizeState(originState);
  const destinationCode = normalizeState(destinationState);
  if (originCode && originCode === destinationCode) return 180;

  const from = STATE_CENTERS[originCode];
  const to = STATE_CENTERS[destinationCode];
  if (!from || !to) return 850;

  const earthRadiusMiles = 3959;
  const latDelta = toRadians(to[0] - from[0]);
  const lngDelta = toRadians(to[1] - from[1]);
  const a = Math.sin(latDelta / 2) ** 2 +
    Math.cos(toRadians(from[0])) * Math.cos(toRadians(to[0])) *
    Math.sin(lngDelta / 2) ** 2;
  const directMiles = earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(Math.min(3200, Math.max(75, directMiles * 1.18 + 45)));
}

function evaluateEquipment(form) {
  const pallets = Math.max(1, numberValue(form.pallets));
  const weight = numberValue(form.totalWeight);
  const length = numberValue(form.length);
  const width = numberValue(form.width);
  const height = numberValue(form.height);
  const oversized = width > 102 || height > 110 || length > 120;

  return {
    ltl: !oversized && pallets <= 6 && weight <= 10000,
    sprinter: !oversized && pallets <= 2 && weight <= 2500 && length <= 72 && width <= 52 && height <= 70,
    box_truck: !oversized && pallets <= 12 && weight <= 12000 && length <= 96 && width <= 96 && height <= 96,
    dry_van: !oversized && pallets <= 26 && weight <= 45000,
    flatbed: weight <= 48000
  };
}

function recommendEquipment(form) {
  const fits = evaluateEquipment(form);
  const pallets = Math.max(1, numberValue(form.pallets));
  const weight = numberValue(form.totalWeight);
  const width = numberValue(form.width);
  const height = numberValue(form.height);
  const length = numberValue(form.length);
  const expedited = form.serviceSpeed === 'expedited';
  let recommendedId = 'dry_van';
  let reason = 'A dedicated dry van provides the best capacity and protection for this shipment.';

  if (width > 102 || height > 110 || length > 120) {
    recommendedId = 'flatbed';
    reason = 'The shipment dimensions exceed standard enclosed-equipment limits, so open-deck capacity is the safest fit.';
  } else if (expedited && fits.sprinter) {
    recommendedId = 'sprinter';
    reason = 'This compact shipment fits a sprinter van and the expedited service preference favors dedicated transit.';
  } else if (expedited && fits.box_truck) {
    recommendedId = 'box_truck';
    reason = 'A box truck balances expedited transit with the pallet and weight requirements.';
  } else if (fits.ltl) {
    recommendedId = 'ltl';
    reason = 'The pallet count and weight fit shared LTL capacity, which avoids paying for an entire trailer.';
  } else if (fits.box_truck) {
    recommendedId = 'box_truck';
    reason = 'A box truck is the smallest dedicated option that comfortably fits this shipment.';
  }

  const recommended = EQUIPMENT_OPTIONS.find(function(option) { return option.id === recommendedId; }) || EQUIPMENT_OPTIONS[3];
  return {
    recommended: recommended,
    reason: reason,
    fits: fits,
    metrics: {
      pallets: pallets,
      weight: weight
    }
  };
}

function getAccessorialTotal(accessorials) {
  const selected = Array.isArray(accessorials) ? accessorials : [];
  return selected.reduce(function(total, item) {
    if (item === 'liftgate') return total + 95;
    if (item === 'appointment') return total + 55;
    if (item === 'inside') return total + 125;
    if (item === 'limited_access') return total + 85;
    return total;
  }, 0);
}

function createPlanningEstimate(form, equipmentId, rank) {
  const option = EQUIPMENT_OPTIONS.find(function(item) { return item.id === equipmentId; }) || EQUIPMENT_OPTIONS[3];
  const miles = estimateLaneMiles(form.originState, form.destinationState);
  const weight = numberValue(form.totalWeight);
  const pallets = Math.max(1, numberValue(form.pallets));
  const rates = {
    ltl: { base: 185, perMile: 0.62, minimum: 425, weightFactor: 0.055 },
    sprinter: { base: 225, perMile: 1.52, minimum: 575, weightFactor: 0.01 },
    box_truck: { base: 325, perMile: 2.05, minimum: 825, weightFactor: 0.012 },
    dry_van: { base: 475, perMile: 2.32, minimum: 1150, weightFactor: 0.008 },
    flatbed: { base: 575, perMile: 2.72, minimum: 1450, weightFactor: 0.009 }
  };
  const rate = rates[equipmentId] || rates.dry_van;
  let linehaul = rate.base + miles * rate.perMile + weight * rate.weightFactor;
  if (equipmentId === 'ltl') linehaul += pallets * 38;
  if (form.serviceSpeed === 'expedited') linehaul *= 1.18;
  if (form.hazmat) linehaul *= 1.16;
  linehaul = Math.max(rate.minimum, linehaul);
  const accessorialTotal = getAccessorialTotal(form.accessorials);
  const total = Math.round((linehaul + accessorialTotal) / 5) * 5;

  return {
    id: 'estimate-' + equipmentId,
    source: 'FCTL Planning Estimate',
    equipmentId: equipmentId,
    equipmentLabel: option.label,
    truckType: option.truckType,
    total: total,
    lineHaul: Math.round(linehaul),
    ratePerMile: Number((linehaul / miles).toFixed(2)),
    mileage: miles,
    transitDays: Math.max(1, Math.ceil(miles / (form.serviceSpeed === 'expedited' ? 650 : 500))),
    accessorialTotal: accessorialTotal,
    isEstimate: true,
    rank: rank || 0
  };
}

function buildPlanningOptions(form, recommendation, selectedEquipmentId) {
  const fits = recommendation.fits;
  const primaryId = selectedEquipmentId || recommendation.recommended.id;
  const compatibleIds = EQUIPMENT_OPTIONS
    .filter(function(option) { return fits[option.id]; })
    .map(function(option) { return option.id; });
  const orderedIds = [primaryId]
    .concat([recommendation.recommended.id])
    .concat(compatibleIds)
    .filter(function(id, index, list) { return id && list.indexOf(id) === index; })
    .slice(0, 3);

  return orderedIds.map(function(id, index) {
    return createPlanningEstimate(form, id, index);
  }).sort(function(a, b) {
    if (a.equipmentId === primaryId) return -1;
    if (b.equipmentId === primaryId) return 1;
    return a.total - b.total;
  });
}

export {
  EQUIPMENT_OPTIONS,
  buildPlanningOptions,
  createPlanningEstimate,
  estimateLaneMiles,
  evaluateEquipment,
  recommendEquipment
};
