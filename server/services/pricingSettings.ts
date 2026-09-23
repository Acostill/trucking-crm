import db from '../db';

export interface PricingSettings {
  expediteAllBeforeAward: boolean;
  updatedAt: string | null;
}

const DEFAULTS: PricingSettings = { expediteAllBeforeAward: true, updatedAt: null };

export async function getPricingSettings(): Promise<PricingSettings> {
  try {
    const result = await db.query(
      'SELECT expedite_all_before_award, updated_at FROM public.pricing_settings WHERE id = 1'
    );
    if (!result.rows.length) return DEFAULTS;
    return {
      expediteAllBeforeAward: result.rows[0].expedite_all_before_award !== false,
      updatedAt: result.rows[0].updated_at ? new Date(result.rows[0].updated_at).toISOString() : null
    };
  } catch (_err) {
    // Missing migration: keep the accuracy-first default.
    return DEFAULTS;
  }
}

export async function updatePricingSettings(
  settings: { expediteAllBeforeAward: boolean },
  userId: string | null
): Promise<PricingSettings> {
  await db.queryWithUser(
    `INSERT INTO public.pricing_settings (id, expedite_all_before_award, updated_by, updated_at)
     VALUES (1, $1, $2, NOW())
     ON CONFLICT (id) DO UPDATE SET
       expedite_all_before_award = EXCLUDED.expedite_all_before_award,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [settings.expediteAllBeforeAward, userId],
    userId
  );
  return getPricingSettings();
}
