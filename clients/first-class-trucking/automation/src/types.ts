export const WORKFLOW_ID = "fct-dat-rateview-lane-pricing";

export type EquipmentType = "Van" | "Flatbed" | "Reefer";
export type RateType = "SPOT" | "CONTRACT";
export type LedgerStatus =
  | "reserved"
  | "submitted"
  | "uncertain"
  | "completed"
  | "no-rate";

export interface QuoteRequest {
  requestId: string;
  origin: string;
  destination: string;
  equipmentType: EquipmentType;
  approveSearch: boolean;
}

export interface OptionalValue<T> {
  value: T | null;
  reason: string | null;
}

export interface MarketRateCard {
  rateType: RateType;
  acceptedMarketLane: string;
  averageTotalUsd: number;
  averagePerMileUsd: number;
  lowTotalUsd: number;
  highTotalUsd: number;
  lowPerMileUsd: number;
  highPerMileUsd: number;
  miles: number;
  timeframe: string;
  fuel: OptionalValue<number>;
}

export interface QuoteResult {
  requestId: string;
  source: "DAT RateView";
  lookupTimestamp: string;
  acceptedOrigin: string;
  acceptedDestination: string;
  acceptedEquipmentType: EquipmentType;
  spot: MarketRateCard;
  contract: MarketRateCard;
}

export interface LedgerEntry {
  requestId: string;
  fingerprint: string;
  day: string;
  runId: string;
  status: LedgerStatus;
  reservedAt: string;
  submittedAt?: string;
  completedAt?: string;
  result?: QuoteResult;
  errorCategory?: string;
}

export interface LedgerFile {
  schemaVersion: 1;
  timezone: string;
  entries: Record<string, LedgerEntry>;
}

export class WorkflowError extends Error {
  constructor(
    public readonly category: string,
    message: string,
    public readonly stepId: string,
  ) {
    super(message);
    this.name = "WorkflowError";
  }
}
