/**
 * Shared types for quote services
 */

// Common location structure used across services
export interface Location {
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

// Common pickup/delivery structure
export interface PickupDelivery {
  location?: Location;
  date?: string;
}

// Common piece/dimension structure
export interface Piece {
  length?: number;
  width?: number;
  height?: number;
  count?: number;
  weight?: number;
}

// Common pieces structure
export interface Pieces {
  quantity?: number;
  unit?: string;
  parts?: Piece[];
}

// Common weight structure
export interface Weight {
  value?: number;
  unit?: string;
}

// Unified quote request structure (used by all services)
export interface UnifiedQuoteRequest {
  pickup?: PickupDelivery;
  delivery?: PickupDelivery;
  pieces?: Pieces;
  weight?: Weight;
  truckType?: string;
  equipmentCategory?: string;
  hazardousMaterial?: {
    unNumbers?: string[];
  };
  accessorialCodes?: string[];
  hazardousUnNumbers?: string[];
  shipmentId?: string;
  referenceNumber?: string;
  [key: string]: any; // Allow additional properties for service-specific fields
}

// API Response wrapper
export interface APIResponse<T> {
  statusCode: number;
  data: T;
}

// Error response structure
export interface ErrorResponse {
  error: string;
  raw?: string;
}

/**
 * Standardized quote response structure
 * Used to normalize responses from all quote services
 */
export interface StandardizedQuote {
  source: 'ExpediteAll' | 'ForwardAir' | 'DAT';
  lineHaul?: number;
  ratePerMile?: number;
  total?: number;
  additionalInfo?: {
    truckType?: string;
    transitTime?: number;
    mileage?: number;
    rateCalculationID?: string;
    accessorials?: Array<{
      description?: string;
      code?: string;
      price?: number;
    }>;
    [key: string]: any; // Allow additional service-specific info
  };
  error?: string;
}

