import { Shipment, StatMetric } from './types';

export const MOCK_CUSTOMERS = [
  { id: 'c1', name: 'TechFlow Logistics', contactName: 'Sarah Jenkins', email: 'sarah@techflow.com' },
  { id: 'c2', name: 'GreenEarth Produce', contactName: 'Mike Ross', email: 'mike@greenearth.com' },
  { id: 'c3', name: 'Apex Manufacturing', contactName: 'David Chen', email: 'd.chen@apex.com' },
  { id: 'c4', name: 'Urban Outfitters', contactName: 'Jessica Day', email: 'jess@urban.com' },
];

export const MOCK_SHIPMENTS: Shipment[] = [
  {
    id: 's1',
    trackingId: 'LNY-8392',
    origin: 'Chicago, IL',
    destination: 'Austin, TX',
    status: 'In Transit',
    customer: MOCK_CUSTOMERS[0],
    revenue: 2400,
    cost: 1900,
    margin: 500,
    repName: 'Alex M.',
    pickupDate: '2023-10-24',
    deliveryDate: '2023-10-26',
    commodity: 'Electronics'
  },
  {
    id: 's2',
    trackingId: 'LNY-9921',
    origin: 'Seattle, WA',
    destination: 'Portland, OR',
    status: 'Delivered',
    customer: MOCK_CUSTOMERS[1],
    revenue: 850,
    cost: 600,
    margin: 250,
    repName: 'Sarah J.',
    pickupDate: '2023-10-22',
    deliveryDate: '2023-10-23',
    commodity: 'Fresh Produce'
  },
  {
    id: 's3',
    trackingId: 'LNY-7732',
    origin: 'Miami, FL',
    destination: 'Atlanta, GA',
    status: 'New Quote',
    customer: MOCK_CUSTOMERS[2],
    revenue: 1200,
    cost: 0, // Not booked yet
    margin: 0,
    repName: 'Alex M.',
    pickupDate: '2023-10-28',
    deliveryDate: '2023-10-29',
    commodity: 'Auto Parts'
  },
  {
    id: 's4',
    trackingId: 'LNY-3321',
    origin: 'Los Angeles, CA',
    destination: 'Phoenix, AZ',
    status: 'Booked',
    customer: MOCK_CUSTOMERS[3],
    revenue: 1100,
    cost: 850,
    margin: 250,
    repName: 'Jordan P.',
    pickupDate: '2023-10-27',
    deliveryDate: '2023-10-28',
    commodity: 'Retail Goods'
  },
  {
    id: 's5',
    trackingId: 'LNY-1209',
    origin: 'New York, NY',
    destination: 'Boston, MA',
    status: 'Paid',
    customer: MOCK_CUSTOMERS[0],
    revenue: 900,
    cost: 650,
    margin: 250,
    repName: 'Alex M.',
    pickupDate: '2023-10-15',
    deliveryDate: '2023-10-16',
    commodity: 'Server Equipment'
  },
   {
    id: 's6',
    trackingId: 'LNY-5543',
    origin: 'Denver, CO',
    destination: 'Salt Lake City, UT',
    status: 'Quoted',
    customer: MOCK_CUSTOMERS[2],
    revenue: 1450,
    cost: 0,
    margin: 0,
    repName: 'Sarah J.',
    pickupDate: '2023-10-30',
    deliveryDate: '2023-10-31',
    commodity: 'Construction Mat.'
  },
  {
    id: 's7',
    trackingId: 'LNY-9988',
    origin: 'Dallas, TX',
    destination: 'Houston, TX',
    status: 'In Transit',
    customer: MOCK_CUSTOMERS[1],
    revenue: 600,
    cost: 450,
    margin: 150,
    repName: 'Jordan P.',
    pickupDate: '2023-10-25',
    deliveryDate: '2023-10-25',
    commodity: 'Beverages'
  }
];

export const PIPELINE_STAGES = [
  'New Quote',
  'Quoted',
  'Booked',
  'In Transit',
  'Delivered',
  'Invoiced',
  'Paid'
];

export const KPIS: StatMetric[] = [
  { label: 'Revenue (MTD)', value: 124500, prefix: '$', trend: 12, trendDirection: 'up' },
  { label: 'Active Shipments', value: 42, trend: 5, trendDirection: 'up' },
  { label: 'Avg Margin', value: 18.2, suffix: '%', trend: -2, trendDirection: 'down' },
  { label: 'Commissions Pending', value: 8240, prefix: '$', trend: 0, trendDirection: 'neutral' },
];

// Mock data for Recharts
export const REVENUE_DATA = [
  { name: 'Mon', value: 4000 },
  { name: 'Tue', value: 3000 },
  { name: 'Wed', value: 2000 },
  { name: 'Thu', value: 2780 },
  { name: 'Fri', value: 1890 },
  { name: 'Sat', value: 2390 },
  { name: 'Sun', value: 3490 },
];
