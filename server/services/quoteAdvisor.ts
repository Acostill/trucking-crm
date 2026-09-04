export interface QuoteAdvisorResult {
  reviewRequired: boolean;
  summary: string;
  checks: Array<{ tone: 'good' | 'warning' | 'info'; label: string; detail: string }>;
}

function numberValue(value: any): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function buildQuoteAdvisor(shipment: any, carrierQuotes: any[]): QuoteAdvisorResult {
  const checks: QuoteAdvisorResult['checks'] = [];
  const assignment = shipment && shipment.truckAssignment;
  const aiRecommendation = shipment && shipment.aiRecommendation;
  const directRates = (carrierQuotes || []).filter(function(option) {
    return option && option.available && option.selectable !== false && option.benchmark !== true && numberValue(option.cost);
  });
  const datBenchmark = (carrierQuotes || []).find(function(option) {
    return option && ['datRateView', 'datSpot', 'datContract'].includes(option.key) && option.available;
  });
  const unNumbers = shipment && shipment.hazardousMaterial && Array.isArray(shipment.hazardousMaterial.unNumbers)
    ? shipment.hazardousMaterial.unNumbers.filter(Boolean)
    : [];

  if (assignment && assignment.status === 'assigned') {
    checks.push({
      tone: 'good',
      label: 'Equipment fit',
      detail: `${shipment.truckType || 'Truck'} — ${assignment.fitSummary || assignment.reason || 'capacity rules passed'}`
    });
  } else {
    checks.push({
      tone: 'warning',
      label: 'Equipment review',
      detail: assignment && assignment.reason ? assignment.reason : 'Staff must confirm the equipment type.'
    });
  }

  checks.push(directRates.length
    ? { tone: 'good', label: 'Bookable pricing', detail: `${directRates.length} connected carrier rate${directRates.length === 1 ? '' : 's'} available.` }
    : { tone: 'warning', label: 'Bookable pricing', detail: 'No connected carrier returned a selectable rate.' });

  if (datBenchmark) {
    const market = datBenchmark.market || datBenchmark;
    const rpm = numberValue(market.averageRatePerMile || market.ratePerMile || market.rpm);
    checks.push({
      tone: 'info',
      label: 'DAT market check',
      detail: rpm ? `Market context is available at ${rpm.toFixed(2)} per mile.` : 'DAT market context is available for comparison.'
    });
  } else {
    checks.push({ tone: 'warning', label: 'DAT market check', detail: 'DAT market context is not ready; staff can price with connected carrier rates or retry DAT.' });
  }

  if (unNumbers.length) {
    checks.push({
      tone: 'warning',
      label: 'Dangerous goods',
      detail: `Explicit ${unNumbers.join(', ')} detected. Verify carrier acceptance and documentation before sending.`
    });
  }

  const aiNeedsReview = Boolean(
    aiRecommendation &&
    aiRecommendation.status === 'completed' &&
    !aiRecommendation.accepted &&
    (!assignment || assignment.source !== 'staff')
  );
  const reviewRequired = !assignment || assignment.status !== 'assigned' || !directRates.length || unNumbers.length > 0 || aiNeedsReview;
  return {
    reviewRequired,
    summary: reviewRequired
      ? 'Review the flagged items, then acknowledge this advisor check before creating the customer price.'
      : 'Equipment, connected pricing, and shipment details are ready for staff confirmation.',
    checks
  };
}
