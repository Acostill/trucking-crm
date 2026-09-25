import db from '../db';
import { UnifiedQuoteRequest } from '../types/quote';
import { CarrierQuoteOption } from './carrierQuoteOptions';
import { getPricingSettings, PricingSettings } from './pricingSettings';

/**
 * Extras and urgency on estimated truck costs. The rate table and DAT price a
 * plain dock-to-dock move; a liftgate, residential stop, or same-day pickup
 * costs more. Live carrier prices (Forward Air, ExpediteAll, staff-recorded)
 * already include their own extras and are left untouched.
 */

export interface AccessorialCharge {
  code: string;
  label: string;
  amount: number;
  perHour: boolean;
  isActive: boolean;
  // 'auto': added to estimated buy rates. 'if_applicable': shown on quotes
  // as a term, billed only if it happens (detention, truck ordered not used).
  billing: 'auto' | 'if_applicable';
  // Vehicles whose all-in rate already covers this extra (liftgate on box trucks).
  includedFor: string[];
  // For per-vehicle terms: Cargo Van, Box Truck, Straight Truck, or Truckload.
  appliesTo: string | null;
}

export interface QuoteExtras {
  items: Array<{ code: string; label: string; amount: number }>;
  // Extras the vehicle's all-in rate already covers (shown, not charged).
  notes: string[];
  urgency: 'same_day' | 'next_day' | null;
  urgencyPct: number;
}

// Shipment accessorial codes (from the email parser or the staff editor)
// mapped to price-list codes. Each matching code counts once, so liftgate at
// pickup and at delivery is charged twice.
const CODE_PATTERNS: Array<[RegExp, string]> = [
  [/LIFT/, 'LIFTGATE'],
  [/RESID/, 'RESIDENTIAL'],
  [/INSIDE/, 'INSIDE_DELIVERY'],
  [/LIMITED|CONSTRUCTION|MILITARY|SCHOOL|CHURCH|PRISON/, 'LIMITED_ACCESS'],
  [/HAZ/, 'HAZMAT'],
  [/AFTER|WEEKEND|HOLIDAY|NIGHT/, 'AFTER_HOURS'],
  [/APPOINT|NOTIFY|CALL/, 'APPOINTMENT']
];

export const ESTIMATE_KEYS = ['rateTable', 'datSpot'];

export async function listAccessorialCharges(): Promise<AccessorialCharge[]> {
  try {
    const result = await db.query('SELECT * FROM public.accessorial_charges ORDER BY sort_order, code');
    return result.rows.map(function(row: any) {
      return {
        code: row.code,
        label: row.label,
        amount: Number(row.amount),
        perHour: row.per_hour === true,
        isActive: row.is_active !== false,
        billing: row.billing === 'if_applicable' ? 'if_applicable' : 'auto',
        includedFor: Array.isArray(row.included_for) ? row.included_for : [],
        appliesTo: row.applies_to || null
      };
    });
  } catch (_err) {
    return [];
  }
}

/** Calendar date in the brokerage's time zone, as YYYY-MM-DD. */
function easternDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);
}

export function computeQuoteExtras(
  shipment: UnifiedQuoteRequest,
  charges: AccessorialCharge[],
  settings: Pick<PricingSettings, 'sameDayPremiumPct' | 'nextDayPremiumPct'>,
  now: Date = new Date()
): QuoteExtras {
  const byCode: Record<string, AccessorialCharge> = {};
  charges.filter(function(charge) { return charge.isActive; }).forEach(function(charge) { byCode[charge.code] = charge; });
  const vehicle = String(shipment.truckType || '').replace(/^Reefer\s+/i, '');
  const items: QuoteExtras['items'] = [];
  const included: string[] = [];
  const add = function(code: string) {
    const charge = byCode[code];
    if (!charge || charge.perHour || charge.billing !== 'auto') return;
    if (charge.includedFor.indexOf(vehicle) > -1) {
      if (included.indexOf(charge.label) === -1) included.push(charge.label);
      return;
    }
    items.push({ code, label: charge.label, amount: charge.amount });
  };

  const codes = (shipment.accessorialCodes || []).map(function(code) { return String(code || '').toUpperCase(); });
  const onceOnly = new Set<string>();
  codes.forEach(function(code) {
    const match = CODE_PATTERNS.find(function(pattern) { return pattern[0].test(code); });
    if (!match) return;
    // Liftgate is per stop; everything else is charged once per load.
    if (match[1] !== 'LIFTGATE') {
      if (onceOnly.has(match[1])) return;
      onceOnly.add(match[1]);
    }
    add(match[1]);
  });
  const unNumbers = (shipment.hazardousMaterial && shipment.hazardousMaterial.unNumbers || []).filter(Boolean);
  if (unNumbers.length && !onceOnly.has('HAZMAT')) { onceOnly.add('HAZMAT'); add('HAZMAT'); }

  const pickupDay = String(shipment.pickup && shipment.pickup.date || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(pickupDay) && !onceOnly.has('AFTER_HOURS')) {
    const weekday = new Date(pickupDay + 'T12:00:00Z').getUTCDay();
    if (weekday === 0 || weekday === 6) { onceOnly.add('AFTER_HOURS'); add('AFTER_HOURS'); }
  }

  let urgency: QuoteExtras['urgency'] = null;
  let urgencyPct = 0;
  if (/^\d{4}-\d{2}-\d{2}$/.test(pickupDay)) {
    const today = easternDate(now);
    const tomorrow = easternDate(new Date(now.getTime() + 86400000));
    if (pickupDay <= today) { urgency = 'same_day'; urgencyPct = settings.sameDayPremiumPct; }
    else if (pickupDay === tomorrow) { urgency = 'next_day'; urgencyPct = settings.nextDayPremiumPct; }
  }

  const notes: string[] = included.map(function(label) { return `${label} included in the ${vehicle.toLowerCase()} rate`; });
  return { items, notes, urgency, urgencyPct };
}

export async function loadQuoteExtras(shipment: UnifiedQuoteRequest): Promise<QuoteExtras> {
  const [charges, settings] = await Promise.all([listAccessorialCharges(), getPricingSettings()]);
  return computeQuoteExtras(shipment, charges, settings);
}

/** Add extras and urgency to estimate options. Safe to re-run: it starts from baseCost. */
export function applyEstimateExtras(options: CarrierQuoteOption[], extras: QuoteExtras): CarrierQuoteOption[] {
  return options.map(function(option) {
    if (ESTIMATE_KEYS.indexOf(option.key) === -1 || !option.available || !(Number(option.cost) > 0)) return option;
    const baseCost = option.baseCost != null ? Number(option.baseCost) : Number(option.cost);
    const extrasTotal = extras.items.reduce(function(sum, item) { return sum + item.amount; }, 0);
    const urgencyAmount = Number((baseCost * extras.urgencyPct / 100).toFixed(2));
    const parts: string[] = [];
    if (extras.items.length) parts.push(extras.items.map(function(item) { return `${item.label} +$${item.amount}`; }).join(', '));
    if (extras.notes.length) parts.push(extras.notes.join(', '));
    if (urgencyAmount) parts.push(`${extras.urgency === 'same_day' ? 'Same-day' : 'Next-day'} +${extras.urgencyPct}% ($${Math.round(urgencyAmount)})`);
    return {
      ...option,
      baseCost,
      cost: Number((baseCost + extrasTotal + urgencyAmount).toFixed(2)),
      extrasTotal: extrasTotal || undefined,
      urgencyAmount: urgencyAmount || undefined,
      extrasNote: parts.length ? parts.join(' · ') : undefined
    };
  });
}
