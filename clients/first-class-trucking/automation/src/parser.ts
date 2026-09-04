import {
  type MarketRateCard,
  type RateType,
  WorkflowError,
} from "./types.ts";

function money(value: string, field: string): number {
  const match = value.match(/\$([\d,]+(?:\.\d+)?)/);
  if (!match) {
    throw new WorkflowError(
      "EXTRACTION_UNVERIFIED",
      `Could not parse ${field}.`,
      "RV-100",
    );
  }
  return Number(match[1].replaceAll(",", ""));
}

const EXPLICITLY_UNAVAILABLE_VALUE = /^(?:n\/?a|-{1,2}|[–—]|not available|unavailable)$/i;

function perMile(value: string, field: string): number | null {
  const normalized = value
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (EXPLICITLY_UNAVAILABLE_VALUE.test(normalized)) return null;
  const numericTokens = normalized.match(/[\d,]+(?:\.\d+)?/g) || [];
  const numericToken = numericTokens.length === 1 ? numericTokens[0] : null;
  const numericTokenIsValid = numericToken !== null && (
    /^\d+(?:\.\d+)?$/.test(numericToken) ||
    /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(numericToken)
  );
  const residue = numericToken
    ? normalized
      .replace(numericToken, "")
      .replace(/\b(?:usd|per|mi|mile|miles|rpm|average|avg)\b/gi, "")
      .replace(/[\s$()\[\]{}\/*.\-_:;†‡*•·]/g, "")
    : normalized;
  const parsed = numericTokenIsValid
    ? Number(numericToken?.replaceAll(",", ""))
    : Number.NaN;
  if (residue || !Number.isFinite(parsed) || parsed <= 0) {
    throw new WorkflowError(
      "EXTRACTION_UNVERIFIED",
      `Could not parse ${field} (format ${rateFormatSignature(normalized)}).`,
      "RV-100",
    );
  }
  return parsed;
}

export function rateFormatSignature(value: string): string {
  return value
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .replace(/\d/g, "#")
    .replace(/[A-Za-z]+/g, "A");
}

const RANGE_NUMBER = "([\\d,]+(?:\\.\\d+)?)";
const PER_MILE_NUMBER = "([\\d.]+)";
const DASH = "[-–—]";
const FULL_RANGE = new RegExp(
  `^\\s*\\$${RANGE_NUMBER}\\s*${DASH}\\s*\\$${RANGE_NUMBER}` +
    `\\s*\\(\\s*\\$${PER_MILE_NUMBER}\\s*(?:\\/\\s*(?:mi|mile))?` +
    `\\s*${DASH}\\s*\\$${PER_MILE_NUMBER}\\s*\\/\\s*(?:mi|mile)\\s*\\)\\s*$`,
  "i",
);
const TOTAL_ONLY_RANGE = new RegExp(
  `^\\s*\\$${RANGE_NUMBER}\\s*${DASH}\\s*\\$${RANGE_NUMBER}\\s*$`,
  "i",
);
const EXPLICITLY_UNAVAILABLE_RANGE = /^(?:n\/?a|--|not available|unavailable|insufficient data|not enough data|no (?:market )?range available|(?:rate|market )?range unavailable)$/i;

function rangeValues(value: string): Pick<
  MarketRateCard,
  "lowTotalUsd" | "highTotalUsd" | "lowPerMileUsd" |
  "highPerMileUsd" | "rangeUnavailableReason"
> {
  const normalized = value.replace(/[\u00a0\u202f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return {
      lowTotalUsd: null,
      highTotalUsd: null,
      lowPerMileUsd: null,
      highPerMileUsd: null,
      rangeUnavailableReason: "DAT did not display a market range",
    };
  }
  const full = normalized.match(FULL_RANGE);
  if (full) {
    return {
      lowTotalUsd: Number(full[1].replaceAll(",", "")),
      highTotalUsd: Number(full[2].replaceAll(",", "")),
      lowPerMileUsd: Number(full[3]),
      highPerMileUsd: Number(full[4]),
      rangeUnavailableReason: null,
    };
  }

  const totals = normalized.match(TOTAL_ONLY_RANGE);
  if (totals) {
    return {
      lowTotalUsd: Number(totals[1].replaceAll(",", "")),
      highTotalUsd: Number(totals[2].replaceAll(",", "")),
      lowPerMileUsd: null,
      highPerMileUsd: null,
      rangeUnavailableReason: "DAT did not display a per-mile market range",
    };
  }

  if (EXPLICITLY_UNAVAILABLE_RANGE.test(normalized)) {
    return {
      lowTotalUsd: null,
      highTotalUsd: null,
      lowPerMileUsd: null,
      highPerMileUsd: null,
      rangeUnavailableReason: "DAT explicitly displayed the market range as unavailable",
    };
  }

  throw new WorkflowError(
    "EXTRACTION_UNVERIFIED",
    "The displayed market range could not be verified.",
    "RV-100",
  );
}

export function parseRateCard(input: {
  rateType: RateType;
  acceptedMarketLane: string;
  averageTotal: string;
  averagePerMile: string;
  milesAndTimeframe: string;
  range: string;
}): MarketRateCard {
  const milesMatch = input.milesAndTimeframe.match(
    /([\d,]+)\s*mi\s*\|\s*(.+)$/i,
  );

  if (!input.acceptedMarketLane.trim() || !milesMatch) {
    throw new WorkflowError(
      "EXTRACTION_UNVERIFIED",
      "The result lane, mileage, or timeframe could not be verified.",
      "RV-100",
    );
  }
  const range = rangeValues(input.range);
  const averagePerMileUsd = perMile(input.averagePerMile, "average per-mile rate");

  return {
    rateType: input.rateType,
    acceptedMarketLane: input.acceptedMarketLane.trim(),
    averageTotalUsd: money(input.averageTotal, "average total"),
    averagePerMileUsd,
    averagePerMileUnavailableReason: averagePerMileUsd === null
      ? "DAT explicitly displayed the average per-mile rate as unavailable"
      : null,
    ...range,
    miles: Number(milesMatch[1].replaceAll(",", "")),
    timeframe: milesMatch[2].trim(),
    fuel: {
      value: null,
      reason: "Quick Rate Lookup did not display a separate fuel value",
    },
  };
}
