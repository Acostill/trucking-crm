/**
 * Extras read straight from the customer's email text, so staff do not have
 * to tick them. The AI parser misses some (it dropped "liftgate needed at
 * delivery" in testing); these phrases are unambiguous in freight emails.
 */
const PHRASES: Array<[RegExp, string]> = [
  [/lift\s*-?\s*gate[^.,;\n]{0,15}\b(pick\s*-?\s*up|origin|shipper)\b|\b(pick\s*-?\s*up|origin|shipper)\b[^.,;\n]{0,15}lift\s*-?\s*gate/i, 'LIFTGATE_PICKUP'],
  [/lift\s*-?\s*gate[^.,;\n]{0,15}\b(deliver\w*|destination|consignee|receiver)\b|\b(deliver\w*|destination|consignee|receiver)\b[^.,;\n]{0,15}lift\s*-?\s*gate|\bno\s+dock\b/i, 'LIFTGATE_DELIVERY'],
  [/\bresidential\b|\bresidence\b|\bhome\s+delivery\b/i, 'RESIDENTIAL_DELIVERY'],
  [/\binside\s+(delivery|pick\s*-?\s*up)\b/i, 'INSIDE_DELIVERY'],
  [/\blimited\s+access\b|\bconstruction\s+site\b|\bmilitary\s+base\b|\bschool\b|\bchurch\b/i, 'LIMITED_ACCESS'],
  [/\bafter\s*-?\s*hours\b|\bweekend\s+(pick\s*-?\s*up|delivery)\b|\bsaturday\b|\bsunday\b/i, 'AFTER_HOURS'],
  [/\bappointment\b|\bcall\s+ahead\b|\bnotify\s+(before|prior)\b/i, 'APPOINTMENT']
];

const NEGATION = /\b(no|not|without|don'?t\s+need)\s+(a\s+)?$/i;

export function extrasFromEmailText(text: string): string[] {
  const codes: string[] = [];
  const body = String(text || '');
  for (const [pattern, code] of PHRASES) {
    const match = body.match(pattern);
    if (!match || match.index == null) continue;
    // Skip "no liftgate", "not residential", etc.
    const before = body.slice(Math.max(0, match.index - 20), match.index);
    if (NEGATION.test(before)) continue;
    if (codes.indexOf(code) === -1) codes.push(code);
  }
  // A bare "liftgate" with no side named usually means delivery.
  if (/lift\s*-?\s*gate/i.test(body) && !codes.some(function(code) { return code.indexOf('LIFTGATE') === 0; })) {
    const index = body.search(/lift\s*-?\s*gate/i);
    if (!NEGATION.test(body.slice(Math.max(0, index - 20), index))) codes.push('LIFTGATE_DELIVERY');
  }
  return codes;
}
