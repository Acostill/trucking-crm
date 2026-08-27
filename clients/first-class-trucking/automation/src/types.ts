export const WORKFLOW_ID = "fct-dat-rateview-lane-pricing";
export const SEARCH_LOADS_WORKFLOW_ID = "fct-dat-search-loads-offers-v1";
export const SEARCH_LOADS_SCHEMA_VERSION = 1;

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

export type SearchLoadsEquipmentType =
  | "Vans (Standard)"
  | "Flatbeds (Standard)"
  | "Reefers (Standard)";

export interface SearchLoadsRequest {
  workflowId: typeof SEARCH_LOADS_WORKFLOW_ID;
  schemaVersion: typeof SEARCH_LOADS_SCHEMA_VERSION;
  requestId: string;
  shipmentRecordId: string;
  searchFingerprint: string;
  origin: string;
  destination: string;
  equipmentType: SearchLoadsEquipmentType;
  pickupDate: string;
  originDeadheadMiles: 150;
  destinationDeadheadMiles: 150;
  loadType: "Full & Partial";
  includeSimilarResults: false;
  approveSearch: boolean;
}

export interface SearchLoadOffer {
  rank: number;
  datLoadId: string;
  sourceOrder: number;
  displayedTotal: string;
  totalUsd: number;
  rpm: string | null;
  tripMiles: string | null;
  origin: string | null;
  destination: string | null;
  originDeadhead: string | null;
  destinationDeadhead: string | null;
  pickup: string | null;
  equipmentCode: string | null;
  weight: string | null;
  lengthLoadType: string | null;
  company: string | null;
  creditScore: string | null;
  daysToPay: string | null;
  comments: string | null;
  commentsStatus: "displayed" | "not_displayed" | "redacted";
}

export interface SearchLoadsResult {
  workflowId: typeof SEARCH_LOADS_WORKFLOW_ID;
  schemaVersion: typeof SEARCH_LOADS_SCHEMA_VERSION;
  requestId: string;
  shipmentRecordId: string;
  searchFingerprint: string;
  source: "DAT Search Loads";
  searchTimestamp: string;
  acceptedCriteria: {
    origin: string;
    destination: string;
    equipmentType: SearchLoadsEquipmentType;
    pickupDate: string;
    originDeadheadMiles: 150;
    destinationDeadheadMiles: 150;
    loadType: "Full & Partial";
    includeSimilarResults: false;
    sort: "Rate - Highest";
  };
  directResultCount: number;
  eligibleCount: number;
  excludedCount: number;
  exclusionReasons: Record<string, number>;
  duplicateCount: number;
  outcome: "completed" | "empty" | "no_qualifying_offers";
  offers: SearchLoadOffer[];
}

export type WorkflowRequest = QuoteRequest | SearchLoadsRequest;
export type WorkflowResult = QuoteResult | SearchLoadsResult;

export interface LedgerEntry {
  requestId: string;
  fingerprint: string;
  day: string;
  runId: string;
  status: LedgerStatus;
  reservedAt: string;
  submittedAt?: string;
  completedAt?: string;
  workflowId?: string;
  result?: WorkflowResult;
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
