import React from 'react';

export enum EquipmentType {
  DRY_VAN = 'Dry Van',
  REEFER = 'Reefer',
  FLATBED = 'Flatbed',
}

export interface QuoteRequest {
  origin: string;
  destination: string;
  pickupDate: string;
  equipment: EquipmentType;
  weight: string;
  length: string;
  width: string;
  height: string;
  additionalInfo: string;
}

export interface FeatureProps {
  title: string;
  description: string;
  icon: React.ReactNode;
}