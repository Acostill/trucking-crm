/**
 * TypeScript types for n8n email paste response structure
 */

export interface PickupLocation {
  city?: string;
  state?: string;
  zip?: string;
  pickup_date?: string;
  pickup_ready_time?: string;
  pickup_close_time?: string;
  address?: string;
  street?: string;
  date_time?: string;
  requested_date_time?: string;
  date?: string;
}

export interface DeliveryOption {
  location_code?: string;
  city?: string;
  state?: string;
  type?: string;
  requested_delivery_date?: string;
  delivery_time_window_start?: string;
  delivery_time_window_end?: string;
  zip_code?: string;
  zip?: string;
  address?: string;
  street?: string;
  expected_date?: string;
  date?: string;
}

export interface Dimension {
  length_in?: number;
  width_in?: number;
  height_in?: number;
  count?: number;
  pallets?: number;
  quantity?: number;
}

export interface ShipmentInfo {
  pallets?: number;
  dimensions?: Dimension[];
  total_weight_lbs?: number;
  weight_lbs?: number;
  commodity?: string;
  stackable?: boolean;
  temperature_control?: {
    min_c?: number;
    max_c?: number;
  };
  data_loggers_required?: number;
  ready_for_loading_date?: string;
  cut_off_time_for_trucking?: string;
  truck_type?: string;
}

export interface SpecialInstructions {
  notes?: string[];
  requirements?: string[];
  driver_requirements?: string[];
  security_requirements?: string[];
  accessorials?: string[];
  compliance_flags?: string[];
  extra_fields?: Record<string, any>;
}

export interface ShipmentDetails {
  pickup?: PickupLocation;
  delivery?: DeliveryOption;
  delivery_options?: DeliveryOption[];
  shipment_info?: ShipmentInfo;
  shipmentInfo?: ShipmentInfo; // Backward compatibility
  dimensions?: Dimension[];
  commodity?: string;
  rate?: number | string;
  rate_type?: string;
  payment_terms?: {
    rate?: number | string;
  };
  shipment?: {
    pickup?: PickupLocation;
    delivery?: DeliveryOption;
  };
  shipment_weight_lbs?: number;
  weight?: number;
  truck_type?: string;
}

export interface EmailBody {
  greeting?: string;
  message?: string;
  shipment_details?: ShipmentDetails;
}

export interface ParsedSample {
  subject?: string;
  body?: EmailBody;
}

export interface N8nEmailPasteResponse {
  statusCode?: number;
  contentType?: string;
  parsedSample?: ParsedSample;
  // Also support direct body structure (for backward compatibility)
  body?: EmailBody;
  shipment?: ShipmentDetails;
  sender?: {
    company?: string;
    name?: string;
    email?: string;
  };
  recipient?: {
    company?: string;
    name?: string;
    email?: string;
  };
  client_name?: string;
  description?: string;
  billing?: {
    rate?: number | string;
    rate_type?: string;
  };
  contact_email?: string;
  truck_type?: string;
  output?: N8nEmailPasteResponse;
}

