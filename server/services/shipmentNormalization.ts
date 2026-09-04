import { Location } from '../types/quote';

type AirportLocation = Required<Pick<Location, 'city' | 'state' | 'zip'>>;

const AIRPORT_CODES: Record<string, AirportLocation> = {
  ATL: { city: 'Atlanta', state: 'GA', zip: '30320' },
  BNA: { city: 'Nashville', state: 'TN', zip: '37214' },
  BOS: { city: 'Boston', state: 'MA', zip: '02128' },
  BWI: { city: 'Baltimore', state: 'MD', zip: '21240' },
  CLT: { city: 'Charlotte', state: 'NC', zip: '28208' },
  DAL: { city: 'Dallas', state: 'TX', zip: '75235' },
  DCA: { city: 'Arlington', state: 'VA', zip: '22202' },
  DEN: { city: 'Denver', state: 'CO', zip: '80249' },
  DFW: { city: 'Dallas', state: 'TX', zip: '75261' },
  DTW: { city: 'Detroit', state: 'MI', zip: '48242' },
  EWR: { city: 'Newark', state: 'NJ', zip: '07114' },
  FLL: { city: 'Fort Lauderdale', state: 'FL', zip: '33315' },
  HOU: { city: 'Houston', state: 'TX', zip: '77061' },
  IAD: { city: 'Dulles', state: 'VA', zip: '20166' },
  IAH: { city: 'Houston', state: 'TX', zip: '77032' },
  JFK: { city: 'Jamaica', state: 'NY', zip: '11430' },
  LAS: { city: 'Las Vegas', state: 'NV', zip: '89119' },
  LAX: { city: 'Los Angeles', state: 'CA', zip: '90045' },
  LGA: { city: 'Queens', state: 'NY', zip: '11371' },
  MCI: { city: 'Kansas City', state: 'MO', zip: '64153' },
  MCO: { city: 'Orlando', state: 'FL', zip: '32827' },
  MDW: { city: 'Chicago', state: 'IL', zip: '60638' },
  MIA: { city: 'Miami', state: 'FL', zip: '33142' },
  MSP: { city: 'Minneapolis', state: 'MN', zip: '55450' },
  ORD: { city: 'Chicago', state: 'IL', zip: '60666' },
  PDX: { city: 'Portland', state: 'OR', zip: '97218' },
  PHL: { city: 'Philadelphia', state: 'PA', zip: '19153' },
  PHX: { city: 'Phoenix', state: 'AZ', zip: '85034' },
  SAN: { city: 'San Diego', state: 'CA', zip: '92101' },
  SEA: { city: 'Seattle', state: 'WA', zip: '98158' },
  SFO: { city: 'San Francisco', state: 'CA', zip: '94128' },
  SLC: { city: 'Salt Lake City', state: 'UT', zip: '84122' },
  STL: { city: 'St. Louis', state: 'MO', zip: '63145' }
};

function airportCode(value: any): string {
  const text = String(value || '').trim().toUpperCase();
  if (AIRPORT_CODES[text]) return text;
  const matches = text.match(/\b[A-Z]{3}\b/g) || [];
  return matches.find(function(code) { return Boolean(AIRPORT_CODES[code]); }) || '';
}

export function normalizeAirportLocation(input: any): Location {
  const location = input || {};
  const code = airportCode(
    location.location_code || location.airport_code || location.code || location.city
  );
  if (!code) {
    return {
      city: location.city || undefined,
      state: location.state || location.state_code || undefined,
      zip: location.zip || location.zip_code || undefined,
      country: location.country || 'US'
    };
  }
  return {
    ...AIRPORT_CODES[code],
    country: 'US'
  };
}

function normalizedUnit(value: any): string {
  return String(value || '').trim().toLowerCase().replace(/\./g, '');
}

export function dimensionToInches(value: any, unit: any): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  const normalized = normalizedUnit(unit);
  const factors: Record<string, number> = {
    in: 1, inch: 1, inches: 1,
    ft: 12, foot: 12, feet: 12,
    mm: 0.0393700787, millimeter: 0.0393700787, millimeters: 0.0393700787,
    cm: 0.3937007874, centimeter: 0.3937007874, centimeters: 0.3937007874,
    m: 39.3700787, meter: 39.3700787, meters: 39.3700787
  };
  const factor = factors[normalized || 'in'];
  return factor ? Number((numeric * factor).toFixed(2)) : undefined;
}

export function weightToPounds(value: any, unit: any): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  const normalized = normalizedUnit(unit);
  const factors: Record<string, number> = {
    lb: 1, lbs: 1, pound: 1, pounds: 1,
    kg: 2.2046226218, kgs: 2.2046226218, kilogram: 2.2046226218, kilograms: 2.2046226218,
    g: 0.0022046226, gram: 0.0022046226, grams: 0.0022046226,
    t: 2204.6226218, tonne: 2204.6226218, tonnes: 2204.6226218
  };
  const factor = factors[normalized || 'lbs'];
  return factor ? Number((numeric * factor).toFixed(2)) : undefined;
}
