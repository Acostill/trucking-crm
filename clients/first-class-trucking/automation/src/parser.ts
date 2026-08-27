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

function perMile(value: string, field: string): number {
  const match = value.match(/\$([\d.]+)\s*\/\s*mi/i);
  if (!match) {
    throw new WorkflowError(
      "EXTRACTION_UNVERIFIED",
      `Could not parse ${field}.`,
      "RV-100",
    );
  }
  return Number(match[1]);
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
  const rangeMatch = input.range.match(
    /\$([\d,]+)\s*-\s*\$([\d,]+)\s*\(\$([\d.]+)\s*-\s*\$([\d.]+)\s*\/\s*mi\)/i,
  );

  if (!input.acceptedMarketLane.trim() || !milesMatch) {
    throw new WorkflowError(
      "EXTRACTION_UNVERIFIED",
      "The result lane, mileage, or timeframe could not be verified.",
      "RV-100",
    );
  }
  if (!rangeMatch) {
    throw new WorkflowError(
      "EXTRACTION_UNVERIFIED",
      "The displayed market range could not be verified.",
      "RV-100",
    );
  }

  return {
    rateType: input.rateType,
    acceptedMarketLane: input.acceptedMarketLane.trim(),
    averageTotalUsd: money(input.averageTotal, "average total"),
    averagePerMileUsd: perMile(input.averagePerMile, "average per-mile rate"),
    lowTotalUsd: Number(rangeMatch[1].replaceAll(",", "")),
    highTotalUsd: Number(rangeMatch[2].replaceAll(",", "")),
    lowPerMileUsd: Number(rangeMatch[3]),
    highPerMileUsd: Number(rangeMatch[4]),
    miles: Number(milesMatch[1].replaceAll(",", "")),
    timeframe: milesMatch[2].trim(),
    fuel: {
      value: null,
      reason: "Quick Rate Lookup did not display a separate fuel value",
    },
  };
}
