/**
 * Normalize state/province to 2-letter codes required by ExpediteAll and DAT APIs.
 * Accepts full names (e.g. "Connecticut", "New York") or existing codes; returns 2-letter code.
 */

const US_STATE_NAME_TO_CODE: Record<string, string> = {
  alabama: 'AL',
  alaska: 'AK',
  arizona: 'AZ',
  arkansas: 'AR',
  california: 'CA',
  colorado: 'CO',
  connecticut: 'CT',
  delaware: 'DE',
  'district of columbia': 'DC',
  florida: 'FL',
  georgia: 'GA',
  hawaii: 'HI',
  idaho: 'ID',
  illinois: 'IL',
  indiana: 'IN',
  iowa: 'IA',
  kansas: 'KS',
  kentucky: 'KY',
  louisiana: 'LA',
  maine: 'ME',
  maryland: 'MD',
  massachusetts: 'MA',
  michigan: 'MI',
  minnesota: 'MN',
  mississippi: 'MS',
  missouri: 'MO',
  montana: 'MT',
  nebraska: 'NE',
  nevada: 'NV',
  'new hampshire': 'NH',
  'new jersey': 'NJ',
  'new mexico': 'NM',
  'new york': 'NY',
  'north carolina': 'NC',
  'north dakota': 'ND',
  ohio: 'OH',
  oklahoma: 'OK',
  oregon: 'OR',
  pennsylvania: 'PA',
  'rhode island': 'RI',
  'south carolina': 'SC',
  'south dakota': 'SD',
  tennessee: 'TN',
  texas: 'TX',
  utah: 'UT',
  vermont: 'VT',
  virginia: 'VA',
  washington: 'WA',
  'west virginia': 'WV',
  wisconsin: 'WI',
  wyoming: 'WY',
  // Territories
  'american samoa': 'AS',
  guam: 'GU',
  'northern mariana islands': 'MP',
  'puerto rico': 'PR',
  'u.s. virgin islands': 'VI'
};

const CANADA_PROVINCE_NAME_TO_CODE: Record<string, string> = {
  alberta: 'AB',
  'british columbia': 'BC',
  manitoba: 'MB',
  'new brunswick': 'NB',
  'newfoundland and labrador': 'NL',
  'newfoundland': 'NL',
  'labrador': 'NL',
  'northwest territories': 'NT',
  'nova scotia': 'NS',
  nunavut: 'NU',
  ontario: 'ON',
  'prince edward island': 'PE',
  quebec: 'QC',
  saskatchewan: 'SK',
  yukon: 'YT',
  'yukon territory': 'YT'
};

const ALL_CODES = new Set<string>([
  ...Object.values(US_STATE_NAME_TO_CODE),
  ...Object.values(CANADA_PROVINCE_NAME_TO_CODE),
  'PQ', 'NF', 'MH', 'MR', 'NN', 'CI', 'CP', 'BJ', 'CU', 'GJ', 'GR', 'QA', 'TA', 'VI', 'VL', 'YC', 'ZT'
]);

/**
 * Normalize state or province to a 2-letter code expected by ExpediteAll and DAT.
 * - If input is already a known 2-letter code (case-insensitive), returns it uppercased.
 * - If input is a full state/province name (e.g. "Connecticut", "New York"), returns the code (e.g. "CT", "NY").
 * - Otherwise returns the trimmed input as-is (caller may get validation errors).
 */
export function normalizeStateToCode(state: string | undefined | null): string {
  const raw = (state != null ? String(state).trim() : '');
  if (!raw) return '';

  const upper = raw.toUpperCase();
  if (raw.length === 2 && ALL_CODES.has(upper)) return upper;

  const lower = raw.toLowerCase();
  if (US_STATE_NAME_TO_CODE[lower]) return US_STATE_NAME_TO_CODE[lower];
  if (CANADA_PROVINCE_NAME_TO_CODE[lower]) return CANADA_PROVINCE_NAME_TO_CODE[lower];

  return upper.length === 2 ? upper : raw;
}
