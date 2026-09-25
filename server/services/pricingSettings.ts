import db from '../db';

export interface PricingSettings {
  expediteAllBeforeAward: boolean;
  minMarginAmount: number;
  sameDayPremiumPct: number;
  nextDayPremiumPct: number;
  trialMode: boolean;
  updatedAt: string | null;
}

const DEFAULTS: PricingSettings = {
  expediteAllBeforeAward: true,
  minMarginAmount: 150,
  sameDayPremiumPct: 50,
  nextDayPremiumPct: 15,
  trialMode: true,
  updatedAt: null
};

function rowToSettings(row: any): PricingSettings {
  const number = function(value: any, fallback: number) {
    return value == null || !Number.isFinite(Number(value)) ? fallback : Number(value);
  };
  return {
    expediteAllBeforeAward: row.expedite_all_before_award !== false,
    minMarginAmount: number(row.min_margin_amount, DEFAULTS.minMarginAmount),
    sameDayPremiumPct: number(row.same_day_premium_pct, DEFAULTS.sameDayPremiumPct),
    nextDayPremiumPct: number(row.next_day_premium_pct, DEFAULTS.nextDayPremiumPct),
    trialMode: row.trial_mode == null ? DEFAULTS.trialMode : row.trial_mode !== false,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null
  };
}

export async function getPricingSettings(): Promise<PricingSettings> {
  try {
    const result = await db.query('SELECT * FROM public.pricing_settings WHERE id = 1');
    return result.rows.length ? rowToSettings(result.rows[0]) : DEFAULTS;
  } catch (_err) {
    // Missing migration: keep the safe defaults.
    return DEFAULTS;
  }
}

export async function updatePricingSettings(
  changes: Partial<Omit<PricingSettings, 'updatedAt'>>,
  userId: string | null
): Promise<PricingSettings> {
  const next = { ...(await getPricingSettings()), ...changes };
  await db.queryWithUser(
    `INSERT INTO public.pricing_settings (
       id, expedite_all_before_award, min_margin_amount, same_day_premium_pct,
       next_day_premium_pct, trial_mode, updated_by, updated_at
     ) VALUES (1, $1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (id) DO UPDATE SET
       expedite_all_before_award = EXCLUDED.expedite_all_before_award,
       min_margin_amount = EXCLUDED.min_margin_amount,
       same_day_premium_pct = EXCLUDED.same_day_premium_pct,
       next_day_premium_pct = EXCLUDED.next_day_premium_pct,
       trial_mode = EXCLUDED.trial_mode,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [next.expediteAllBeforeAward, next.minMarginAmount, next.sameDayPremiumPct, next.nextDayPremiumPct, next.trialMode, userId],
    userId
  );
  return getPricingSettings();
}
