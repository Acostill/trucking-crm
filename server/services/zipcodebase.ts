import { URL } from 'url';
import db from '../db';

export class ZipcodebaseError extends Error {
  status: number;
  details?: any;

  constructor(message: string, status: number, details?: any) {
    super(message);
    this.name = 'ZipcodebaseError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Try to resolve ZIP information from our local Neon database first.
 * Returns a payload shaped like zipcodebase search results:
 * {
 *   results: {
 *     [searchCode]: [
 *       {
 *         postal_code,
 *         city,
 *         state,
 *         state_code,
 *         country_code
 *       },
 *       ...
 *     ]
 *   }
 * }
 */
async function searchZipInDatabase(code: string, country: string) {
  const trimmedCode = (code || '').trim();
  if (!trimmedCode) return null;

  try {
    const sql = `
      SELECT zip, city, state, state_code, country, airport_iata
      FROM public.zip_codes
      WHERE country = $2
        AND zip LIKE $1 || '%'
      ORDER BY zip, city
      LIMIT 25
    `;
    const result = await db.query(sql, [trimmedCode, country]);

    if (!result.rows || !result.rows.length) {
      return null;
    }

    const items = result.rows.map(function(row: any) {
      return {
        postal_code: row.zip,
        city: row.city || '',
        // Full state name (or fallback) in state
        state: row.state || row.state_code || '',
        // Shortened state code in state_code
        state_code: row.state_code || row.state || '',
        country_code: row.country || country,
        airport_iata: row.airport_iata || null
      };
    });

    return { results: { [trimmedCode]: items } };
  } catch (err) {
    // If the DB lookup fails for any reason, log and fall back to external API
    console.error('[zipcodebase] Error querying local zip_codes table, falling back to external API:', err);
    return null;
  }
}

const KNOWN_AIRPORT_ZIPS = new Set<string>([
  // Common U.S. airport ZIPs we already know about in the app
  '77032', // IAH - Houston, TX
  '77061', // HOU - Houston, TX
  '90045', // LAX - Los Angeles, CA
  '11430', // JFK - New York, NY
  '11371', // LGA - Queens, NY
  '07114', // EWR - Newark, NJ
  '60666', // ORD - Chicago, IL
  '60638', // MDW - Chicago, IL
  '75261', // DFW - Dallas, TX
  '75235', // DAL - Dallas, TX
  '30320', // ATL - Atlanta, GA
  '33126', // MIA - Miami, FL
  '33315', // FLL - Fort Lauderdale, FL
  '98158', // SEA - Seattle, WA
  '94128', // SFO - San Francisco, CA
  '80249', // DEN - Denver, CO
  '89119', // LAS - Las Vegas, NV
  '85034', // PHX - Phoenix, AZ
  '28208', // CLT - Charlotte, NC
  '02128', // BOS - Boston, MA
  '48242', // DTW - Detroit, MI
  '55450', // MSP - Minneapolis, MN
  '19153', // PHL - Philadelphia, PA
  '21240', // BWI - Baltimore, MD
  '22202', // DCA - Arlington, VA
  '20166', // IAD - Dulles, VA
  '84122', // SLC - Salt Lake City, UT
  '97218', // PDX - Portland, OR
  '63145', // STL - St. Louis, MO
  '64153', // MCI - Kansas City, MO
  '79925'  // FCO/Fort Bliss/El Paso area (treated as airport vicinity in app)
]);

async function detectAirportZip(
  zip: string,
  city: string,
  state: string,
  country: string
): Promise<{ isAirport: boolean; enriched: boolean }> {
  // Hard-coded certainty: if it's in our known airport ZIP list, treat as airport
  if (KNOWN_AIRPORT_ZIPS.has(String(zip))) {
    return { isAirport: true, enriched: true };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // If no OpenRouter key, skip AI enrichment and do not classify
    console.warn('[zipcodebase] OPENROUTER_API_KEY not set; cannot classify airport ZIPs via AI');
    return { isAirport: false, enriched: false };
  }

  const model =
    process.env.OPENROUTER_MODEL ||
    'meta-llama/llama-3.1-8b-instruct';

  const prompt = [
    'You are an expert on global geography and airports.',
    'Given a postal code, city, state (or region), and country, determine if this postal code primarily corresponds to an airport facility (including airport terminals, cargo facilities, or buildings inside airport grounds).',
    '',
    'Respond with a single word: "true" if it is primarily an airport ZIP/postal code, or "false" otherwise.',
    '',
    `Postal code: ${zip}`,
    `City: ${city || '(unknown)'}`,
    `State/Region: ${state || '(unknown)'}`,
    `Country: ${country || '(unknown)'}`,
    '',
    'Answer:'
  ].join('\n');

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://trucking-crm.app',
        'X-Title': 'Trucking CRM Zip Airport Detection'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You answer strictly with "true" or "false".' },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        max_tokens: 5
      })
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('[zipcodebase] OpenRouter airport detection failed:', {
        status: response.status,
        body: text.slice(0, 500),
        zip,
        city,
        state,
        country
      });
      return { isAirport: false, enriched: false };
    }

    const data: any = await response.json();
    const content = data?.choices?.[0]?.message?.content || '';
    const answerRaw = String(content).trim().toLowerCase();
    const isAirport = answerRaw.startsWith('true');

    console.log('[zipcodebase] Airport detection result:', {
      zip,
      city,
      state,
      country,
      answer: answerRaw,
      isAirport
    });

    return { isAirport, enriched: true };
  } catch (err) {
    console.error('[zipcodebase] Error calling OpenRouter for airport detection:', {
      error: err,
      zip,
      city,
      state,
      country
    });
    return { isAirport: false, enriched: false };
  }
}

async function searchZipWithZipcodebaseAPI(code: string, country: string) {
  const trimmedCode = (code || '').trim();
  if (!trimmedCode) {
    throw new ZipcodebaseError('Zip code is required', 400);
  }

  const apiKey = process.env.ZIPCODEBASE_API_KEY;
  if (!apiKey) {
    throw new ZipcodebaseError('ZIPCODEBASE_API_KEY is not configured', 500);
  }

  const url = new URL('https://app.zipcodebase.com/api/v1/search');
  url.searchParams.set('apikey', apiKey);
  // Support comma-separated list of codes for batch lookups
  url.searchParams.set('codes', trimmedCode);
  url.searchParams.set('country', country);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  const text = await response.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : {};
  } catch (_err) {
    // If upstream didn't return JSON, bubble up a structured error
    console.error('[zipcodebase] Failed to parse JSON from response:', {
      status: response.status,
      textSnippet: text ? String(text).slice(0, 500) : null
    });
    throw new ZipcodebaseError(
      'Upstream zip search failed',
      response.status || 502,
      { textSnippet: text ? String(text).slice(0, 500) : null }
    );
  }

  if (!response.ok) {
    const message =
      (json && (json.error || json.message)) ||
      `Zip search upstream error: ${response.status}`;

    console.error('[zipcodebase] Non-OK response from API:', {
      status: response.status,
      message,
      bodySnippet: JSON.stringify(json).slice(0, 500)
    });

    throw new ZipcodebaseError(
      message,
      response.status || 502,
      { bodySnippet: JSON.stringify(json).slice(0, 500) }
    );
  }

  // If upstream JSON itself indicates an error, log it (even if HTTP status was OK)
  if (json && (json.error || json.message) && !json.results) {
    console.error('[zipcodebase] JSON indicates error despite OK status:', {
      status: response.status,
      bodySnippet: JSON.stringify(json).slice(0, 500)
    });
  }

  // Try to persist any returned ZIP records into public.zip_codes for future lookups.
  // json.results is an object keyed by each requested ZIP code.
  try {
    const resultsObj = json && json.results ? json.results : null;
    if (resultsObj && typeof resultsObj === 'object') {
      const zipKeys = Object.keys(resultsObj);
      for (const zipKey of zipKeys) {
        const arr = resultsObj[zipKey];
        if (!Array.isArray(arr) || !arr.length) continue;

        for (const item of arr) {
          const zip = item.postal_code || item.zip || zipKey;
          const city = item.city_en || item.city || '';
          // zipcodebase uses:
          // - state: full state/region name
          // - state_code: shortened code
          let stateFull = item.state || '';
          let stateCode = item.state_code || '';
          // Fallbacks: if only one is present, use it for both so we don't store blanks
          if (!stateFull && stateCode) stateFull = stateCode;
          if (!stateCode && stateFull) stateCode = stateFull;
          const countryCode = (item.country_code || country || 'US').toUpperCase();

          // Require at least zip and city to store a record
          if (!zip || !city) continue;

          // Ask OpenRouter whether this looks like an airport ZIP.
          // Only insert into public.zip_codes if this ZIP was actually
          // enriched by the AI lookup (or is in our known airport list).
          const detection = await detectAirportZip(String(zip), String(city), String(stateFull), countryCode);
          if (!detection.enriched) {
            continue;
          }

          const insertSql = `
            INSERT INTO public.zip_codes (zip, city, state, state_code, is_airport, country)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (zip, city) DO UPDATE
            SET state = EXCLUDED.state,
                state_code = EXCLUDED.state_code,
                is_airport = EXCLUDED.is_airport,
                country = EXCLUDED.country,
                updated_at = NOW()
          `;

          try {
            await db.query(insertSql, [
              String(zip),
              String(city),
              String(stateFull),
              String(stateCode),
              detection.isAirport,
              countryCode
            ]);
          } catch (err) {
            // Log but don't block the response if enrichment fails
            console.error('[zipcodebase] Failed to upsert zip_codes from API result:', {
              error: err,
              zip,
              city,
              stateFull,
              stateCode,
              countryCode
            });
          }
        }
      }
    }
  } catch (err) {
    console.error('[zipcodebase] Unexpected error while upserting zip_codes from API results:', err);
    // Swallow; API response to caller should still succeed
  }

  // Pass through the zipcodebase JSON as-is so existing client mappers keep working
  return json;
}

export async function searchZipcodebase(code: string, country: string = 'US'): Promise<any> {
  const trimmedCode = (code || '').trim();
  if (!trimmedCode) {
    throw new ZipcodebaseError('Zip code is required', 400);
  }

  // 1) Try local Neon database first
  const localResult = await searchZipInDatabase(trimmedCode, country);
  if (localResult && localResult.results && localResult.results[trimmedCode] && localResult.results[trimmedCode].length) {
    return localResult;
  }

  // 2) Only call external zipcodebase API for full 5-digit ZIP searches.
  // For prefix searches (3–4 digits), just return an empty result set to avoid unnecessary API calls.
  if (trimmedCode.length !== 5) {
    return { results: { [trimmedCode]: [] } };
  }

  // 3) Fallback to external zipcodebase API if nothing is found locally
  return searchZipWithZipcodebaseAPI(trimmedCode, country);
}

/**
 * Resolve a single ZIP from city + state (and optional country) using the local zip_codes table.
 * Used when the client sends city/state (e.g. from city search) but no zip, so quote APIs get a zip.
 * @returns First matching zip or null if not found
 */
export async function resolveZipFromCityState(
  city: string,
  state: string,
  country: string = 'US'
): Promise<string | null> {
  const trimmedCity = (city || '').trim();
  const trimmedState = (state || '').trim();
  const trimmedCountry = (country || 'US').trim().toUpperCase();
  if (!trimmedCity) return null;

  try {
    const hasState = trimmedState.length > 0;
    const result = hasState
      ? await db.query(
          `SELECT zip
           FROM public.zip_codes
           WHERE country = $3
             AND LOWER(TRIM(city)) = LOWER($1)
             AND (TRIM(state_code) = $2 OR TRIM(state) = $2 OR LOWER(TRIM(state_code)) = LOWER($2) OR LOWER(TRIM(state)) = LOWER($2))
           ORDER BY zip
           LIMIT 1`,
          [trimmedCity, trimmedState, trimmedCountry]
        )
      : await db.query(
          `SELECT zip
           FROM public.zip_codes
           WHERE country = $2 AND LOWER(TRIM(city)) = LOWER($1)
           ORDER BY zip
           LIMIT 1`,
          [trimmedCity, trimmedCountry]
        );
    const row = result.rows && result.rows[0];
    return row ? String(row.zip).trim() : null;
  } catch (err) {
    console.error('[zipcodebase] resolveZipFromCityState error:', err);
    return null;
  }
}

export async function searchCityZipcodebase(city: string, country: string = 'US'): Promise<any> {
  const trimmedCity = (city || '').trim();
  if (!trimmedCity) {
    throw new ZipcodebaseError('City is required', 400);
  }

  const apiKey = process.env.ZIPCODEBASE_API_KEY;
  if (!apiKey) {
    throw new ZipcodebaseError('ZIPCODEBASE_API_KEY is not configured', 500);
  }

  const url = new URL('https://app.zipcodebase.com/api/v1/code/city');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('city', trimmedCity);
  url.searchParams.set('country', (country || 'US').toLowerCase());

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  });

  const text = await response.text();
  let json: any = null;

  try {
    json = text ? JSON.parse(text) : {};
  } catch (_err) {
    console.error('[city-search] Failed to parse JSON from zipcodebase city response:', {
      status: response.status,
      textSnippet: text ? String(text).slice(0, 500) : null
    });
    throw new ZipcodebaseError(
      'Upstream city search failed',
      response.status || 502,
      { textSnippet: text ? String(text).slice(0, 500) : null }
    );
  }

  if (!response.ok) {
    const message =
      (json && (json.error || json.message)) ||
      `City search upstream error: ${response.status}`;

    console.error('[city-search] Non-OK response from zipcodebase city API:', {
      status: response.status,
      message,
      bodySnippet: JSON.stringify(json).slice(0, 500)
    });

    throw new ZipcodebaseError(
      message,
      response.status || 502,
      { bodySnippet: JSON.stringify(json).slice(0, 500) }
    );
  }

  // Log JSON-level errors even on 200
  if (json && (json.error || json.message) && !json.results) {
    console.error('[city-search] zipcodebase city JSON indicates error despite OK status:', {
      status: response.status,
      bodySnippet: JSON.stringify(json).slice(0, 500)
    });
  }

  // Additionally, for the resulting ZIP codes from the city search:
  // 1) First check our local database, then perform a batch zipcodebase /search call
  //    ONLY for ZIPs that are not already present in public.zip_codes (to enrich DB).
  // 2) Attach a zip_details map to the JSON response so clients can display
  //    city + state + airport info in city dropdowns.
  try {
    const zips = Array.isArray(json.results) ? json.results : [];
    const normalizedZips = zips
      .map(function(z) { return String(z).trim(); })
      .filter(function(z) { return z.length > 0; });
    const uniqueZips: string[] = Array.from(new Set<string>(normalizedZips));

      if (uniqueZips.length) {
      const upperCountry = (country || 'US').toUpperCase();

      // 1) Check which of these ZIPs we already have in public.zip_codes
      const existingResult = await db.query(
        `
          SELECT zip
          FROM public.zip_codes
          WHERE zip = ANY($1::text[])
            AND country = $2
        `,
        [uniqueZips, upperCountry]
      );

      const existingZips = new Set<string>();
      (existingResult.rows || []).forEach(function(row: any) {
        existingZips.add(String(row.zip).trim());
      });

      // 2) Only fetch details for ZIPs not already present in our DB.
      // Limit to at most 3 ZIP codes per city search to keep the
      // AI enrichment (via detectAirportZip) fast and predictable.
      const zipsToFetchAll = uniqueZips.filter(function(zip) { return !existingZips.has(zip); });
      const zipsToFetch = zipsToFetchAll.slice(0, 3);

      if (zipsToFetch.length) {
        const codesParam = zipsToFetch.join(',');
        await searchZipWithZipcodebaseAPI(codesParam, upperCountry);
      }

      // 3) Build a zip_details map from our DB for all the ZIPs in the response
      const detailsResult = await db.query(
        `
          SELECT zip, city, state, state_code, country, airport_iata
          FROM public.zip_codes
          WHERE zip = ANY($1::text[])
            AND country = $2
        `,
        [uniqueZips, upperCountry]
      );

      const detailMap: Record<string, any> = {};
      (detailsResult.rows || []).forEach(function(row: any) {
        const key = String(row.zip).trim();
        detailMap[key] = {
          city: row.city || '',
          state: row.state || row.state_code || '',
          state_code: row.state_code || row.state || '',
          country_code: row.country || upperCountry,
          airport_iata: row.airport_iata || null
        };
      });

      (json as any).zip_details = detailMap;
    }
  } catch (err) {
    console.error('[city-search] Failed to batch-enrich ZIP codes via zipcodebase search:', err);
    // Do not fail the city search if enrichment fails
  }

  return json;
}
