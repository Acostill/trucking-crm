export type ShipmentStatus = 
  | 'New Quote' 
  | 'Quoted' 
  | 'Booked' 
  | 'In Transit' 
  | 'Delivered' 
  | 'Invoiced' 
  | 'Paid';

export interface Customer {
  id: string;
  name: string;
  contactName: string;
  email: string;
  logoUrl?: string;
}

export interface Shipment {
  id: string;
  trackingId: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  customer: Customer;
  revenue: number;
  cost: number;
  margin: number;
  repName: string;
  pickupDate: string;
  deliveryDate: string;
  commodity: string;
}

export interface StatMetric {
  label: string;
  value: string | number;
  trend?: number; // percentage
  trendDirection?: 'up' | 'down' | 'neutral';
  prefix?: string;
  suffix?: string;
}

export type ViewState = 'dashboard' | 'shipments' | 'pipeline' | 'commissions' | 'analytics' | 'settings';
