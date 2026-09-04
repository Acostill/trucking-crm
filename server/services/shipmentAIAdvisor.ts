import OpenAI from 'openai';
import { UnifiedQuoteRequest } from '../types/quote';
import {
  applyValidatedAITruckRecommendation,
  CAPACITY_RULES,
  SupportedTruckType,
  SUPPORTED_TRUCK_TYPES
} from './truckAssignment';

export type ShipmentAIAdvisorStatus = 'completed' | 'fallback' | 'disabled';

export interface ShipmentAIRecommendation {
  status: ShipmentAIAdvisorStatus;
  model: string;
  recommendedTruckType: string;
  appliedTruckType: string;
  accepted: boolean;
  confidence: 'high' | 'medium' | 'low';
  fitAnalysis: string;
  suggestions: string[];
  risks: string[];
  generatedAt: string;
  note?: string;
}

interface ModelRecommendation {
  recommendedTruckType: SupportedTruckType;
  confidence: 'high' | 'medium' | 'low';
  fitAnalysis: string;
  suggestions: string[];
  risks: string[];
}

let client: OpenAI | null = null;

function configuredModel(): string {
  return String(process.env.OPENAI_SHIPMENT_MODEL || 'gpt-5.6-terra').trim();
}

function getClient(): OpenAI | null {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey || /^replace[-_]/i.test(apiKey)) return null;
  if (!client) client = new OpenAI({ apiKey });
  return client;
}

function cleanList(value: any): string[] {
  return Array.isArray(value)
    ? value.map(function(item) { return String(item || '').trim(); }).filter(Boolean).slice(0, 5)
    : [];
}

function fallbackRecommendation(
  shipment: UnifiedQuoteRequest,
  status: 'fallback' | 'disabled',
  note: string
): ShipmentAIRecommendation {
  return {
    status,
    model: configuredModel(),
    recommendedTruckType: String(shipment.truckType || ''),
    appliedTruckType: String(shipment.truckType || ''),
    accepted: false,
    confidence: 'high',
    fitAnalysis: shipment.truckAssignment && shipment.truckAssignment.reason
      ? String(shipment.truckAssignment.reason)
      : 'The CRM deterministic equipment rules were used.',
    suggestions: ['Confirm service requirements and carrier availability before sending the customer quote.'],
    risks: [],
    generatedAt: new Date().toISOString(),
    note
  };
}

export function applyModelRecommendation(
  shipment: UnifiedQuoteRequest,
  recommendation: ModelRecommendation,
  model = configuredModel()
): { shipment: UnifiedQuoteRequest; advisor: ShipmentAIRecommendation } {
  const validation = applyValidatedAITruckRecommendation(
    shipment,
    recommendation.recommendedTruckType,
    recommendation.fitAnalysis
  );
  const risks = cleanList(recommendation.risks);
  if (!validation.accepted && validation.reason !== 'Staff-confirmed equipment was preserved.') {
    risks.unshift(validation.reason);
  }
  const appliedTruckType = String(validation.shipment.truckType || shipment.truckType || '');
  const advisor: ShipmentAIRecommendation = {
    status: 'completed',
    model,
    recommendedTruckType: recommendation.recommendedTruckType,
    appliedTruckType,
    accepted: validation.accepted,
    confidence: recommendation.confidence,
    fitAnalysis: String(recommendation.fitAnalysis || validation.reason),
    suggestions: cleanList(recommendation.suggestions),
    risks: risks.slice(0, 5),
    generatedAt: new Date().toISOString(),
    ...(validation.reason === 'Staff-confirmed equipment was preserved.'
      ? { note: 'Staff-confirmed equipment remains authoritative; the model recommendation is advisory.' }
      : !validation.accepted
        ? { note: 'The CRM kept the deterministic safe equipment choice.' }
        : {})
  };
  return {
    shipment: { ...validation.shipment, aiRecommendation: advisor },
    advisor
  };
}

export async function adviseShipmentWithOpenAI(
  shipment: UnifiedQuoteRequest
): Promise<{ shipment: UnifiedQuoteRequest; advisor: ShipmentAIRecommendation }> {
  if (String(process.env.OPENAI_SHIPMENT_ADVISOR_ENABLED || '').trim().toLowerCase() === 'false') {
    const advisor = fallbackRecommendation(shipment, 'disabled', 'OpenAI shipment advice is disabled on this server.');
    return { shipment: { ...shipment, aiRecommendation: advisor }, advisor };
  }

  const openai = getClient();
  if (!openai) {
    const advisor = fallbackRecommendation(shipment, 'fallback', 'OPENAI_API_KEY is not configured; deterministic safeguards were used.');
    return { shipment: { ...shipment, aiRecommendation: advisor }, advisor };
  }

  try {
    const response: any = await (openai.responses as any).create({
      model: configuredModel(),
      store: false,
      instructions:
        'You are a conservative freight shipment advisor for First Class Trucking. ' +
        'Recommend exactly one supported equipment type using the supplied pallet count, per-piece dimensions, total weight, stackability, temperature service, and hard capacity rules. ' +
        'Never exceed a rule, never change dry versus refrigerated service, and prefer the smallest safe truck. ' +
        'Point out missing operational checks without inventing facts. Your output is advisory and a staff member makes the final price and booking decision.',
      input: JSON.stringify({
        shipment: {
          pieces: shipment.pieces,
          weight: shipment.weight,
          stackable: shipment.stackable,
          temperatureControlled: shipment.temperatureControlled,
          temperatureControl: shipment.temperatureControl,
          commodity: shipment.commodity,
          hazardousMaterial: shipment.hazardousMaterial,
          accessorialCodes: shipment.accessorialCodes,
          deterministicRecommendation: shipment.truckType
        },
        supportedTruckTypes: SUPPORTED_TRUCK_TYPES,
        hardCapacityRules: CAPACITY_RULES
      }),
      text: {
        format: {
          type: 'json_schema',
          name: 'shipment_recommendation',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              recommendedTruckType: { type: 'string', enum: SUPPORTED_TRUCK_TYPES },
              confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
              fitAnalysis: { type: 'string' },
              suggestions: { type: 'array', items: { type: 'string' }, maxItems: 5 },
              risks: { type: 'array', items: { type: 'string' }, maxItems: 5 }
            },
            required: ['recommendedTruckType', 'confidence', 'fitAnalysis', 'suggestions', 'risks']
          }
        }
      }
    }, { timeout: 20000 });
    const parsed = JSON.parse(String(response.output_text || '{}')) as ModelRecommendation;
    return applyModelRecommendation(shipment, parsed, configuredModel());
  } catch (err: any) {
    console.error('[Shipment AI advisor] Falling back to deterministic assignment:', err && err.message ? err.message : err);
    const advisor = fallbackRecommendation(
      shipment,
      'fallback',
      'OpenAI advice was temporarily unavailable; deterministic safeguards were used.'
    );
    return { shipment: { ...shipment, aiRecommendation: advisor }, advisor };
  }
}
