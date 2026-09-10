import {
  DEFAULT_PRICING_CONFIG,
  type ChannelPricingConfig,
  type MarketCategory,
  type MarketQuantiles,
  type PricingConfig,
  type SalesChannel,
} from './pricing-config';

export type Confidence = 'high' | 'medium' | 'low';
export type PricingStatus =
  | 'OK'
  | 'REVIEW_MARKET_FIT'
  | 'BLOCKED_LICENSE'
  | 'BLOCKED_UNSAFE'
  | 'BLOCKED_STRUCTURAL'
  | 'BLOCKED_DISCLOSURE'
  | 'REJECT_OR_RECLASSIFY';
export type Demand = 'niche' | 'known' | 'very_known' | 'trend' | 'unknown';
export type Competition = 'low' | 'medium' | 'high' | 'unknown';
export type ProductTier = 'standard' | 'premium' | 'ultra';
export type DiscountState = 'GREEN' | 'YELLOW' | 'RED';

export type ValueInputs = {
  complexity: number;
  functionValue: number;
  giftValue: number;
  collectorValue: number;
  personalization: number;
  finish: number;
};

export type DiscountResult = {
  discountRate: number;
  salePrice: number;
  netRevenue: number;
  contribution: number;
  state: DiscountState;
};

export interface PriceRecommendation {
  status: PricingStatus;
  confidence: Confidence;
  channel: SalesChannel;
  cogs?: number;
  minimumContribution?: number;
  requiredNet?: number;
  floorPrice?: number;
  marketPrice?: number;
  rawPrice?: number;
  recommendedPrice?: number;
  expectedContribution?: number;
  expectedMargin?: number;
  markupRate?: number;
  marginRate?: number;
  diagnostics: {
    presenceFactor?: number;
    valueFactor?: number;
    demandCompetitionFactor?: number;
    selectedQuantile?: number;
    selectedQuantilePosition?: number;
    roundingRule?: string;
    priceDriver?: 'floor' | 'market';
    volumeComponent?: number;
    warnings?: string[];
    etsyScenarios?: Record<string, number>;
  };
  discountSafety?: {
    tenPercent: DiscountResult;
    fifteenPercent: DiscountResult;
    twentyPercent: DiscountResult;
    maximumSafeDiscount: number;
  };
}

export type PhysicalPricingInput = {
  cogs: number;
  channel: SalesChannel;
  category: Exclude<MarketCategory, 'digital'>;
  tier: ProductTier;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  referenceLongestCm?: number | null;
  referenceVolumeCm3?: number | null;
  categorySampleLongestCm?: number[];
  categorySampleVolumesCm3?: number[];
  hollowBody?: boolean;
  highEndCollector?: boolean;
  value: ValueInputs;
  demand: Demand;
  competition: Competition;
  buyerShipping?: number;
  channelNonCogsCost?: number;
  channelOverrides?: Partial<ChannelPricingConfig>;
  offsiteRate?: 0 | 0.12 | 0.15;
  config?: PricingConfig;
};

export type DigitalLicense = {
  creator?: string;
  sourceUrl?: string;
  licenseSource?: string;
  startDate?: string;
  endDate?: string;
  physicalCommercialUseAllowed: boolean;
  digitalRedistributionAllowed: boolean;
  buyerCommercialUseAllowed: boolean;
  evidence?: string;
};

export type DigitalPricingInput = {
  channel: SalesChannel;
  license?: DigitalLicense | null;
  modelComplexity: number;
  demand: number;
  differentiation: number;
  utility: number;
  printReadiness: number;
  competition: Competition;
  demandClass?: Demand;
  isLeadProduct?: boolean;
  config?: PricingConfig;
};

export type DefectInputs = {
  aestheticVisibility: number;
  functionalImpact: number;
  structuralRisk: number;
  nonRepairability: number;
  giftCollectorLoss: number;
};

export type BWareInput = {
  normalPrice: number;
  channel: SalesChannel;
  defects: DefectInputs;
  safetyRisk: boolean;
  structurallyUnreliable: boolean;
  mainFunctionLost: boolean;
  defectCanBeClearlyDisclosed: boolean;
  futureNonFeeCosts: number;
  buyerShipping?: number;
  channelOverrides?: Partial<ChannelPricingConfig>;
  collectible?: boolean;
  config?: PricingConfig;
};

export type BWareResult = {
  status: PricingStatus;
  defectScore?: number;
  defectFactor?: number;
  economicRecoveryFloor?: number;
  rawPrice?: number;
  recommendedPrice?: number;
};

export type PortfolioSale = {
  sku?: string;
  productId?: string;
  familyId?: string;
  variantId?: string;
  channel: string;
  soldAt: string;
  quantity: number;
  realizedPrice?: number | null;
  discounts?: number | null;
  fees?: number | null;
  cogsSnapshot?: number | null;
  season?: string | null;
  launchedAt?: string | null;
};

export type PortfolioState =
  | 'PROTECT_TEST_UP'
  | 'HOLD'
  | 'INVESTIGATE'
  | 'BUNDLE_CANDIDATE'
  | 'REPRICE_DOWN_TEST'
  | 'RETIRE_PAUSE';

export type PortfolioSignal = {
  key: string;
  sku: string;
  variantId?: string;
  channel: string;
  sales30: number;
  sales60: number;
  sales90: number;
  previous30: number;
  trend30: number;
  realizedPrice: number | null;
  contributionMargin: number | null;
  state: PortfolioState;
  priority: 'chance' | 'check' | 'optimization';
  reason: string;
  aggregatedAt: 'variant' | 'sku' | 'family';
};

const EPSILON = 1e-9;

export function clamp(value: number, minimum = 0, maximum = 1) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function median(values: number[]) {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function calculateMinimumContribution(
  cogs: number,
  config = DEFAULT_PRICING_CONFIG,
) {
  return Math.max(
    config.physical.minimumAbsoluteContribution,
    Math.max(0, cogs) * config.physical.minimumCogsContributionRate,
  );
}

export function calculateRequiredNet(
  cogs: number,
  minimumContribution: number,
  channelNonCogsCost = 0,
) {
  return Math.max(0, cogs) + Math.max(0, minimumContribution) + Math.max(0, channelNonCogsCost);
}

export function invertChannelFees({
  requiredNet,
  discountFactor = 1,
  buyerShipping = 0,
  percentageFees = 0,
  fixedFees = 0,
  feeVatRate = 0,
  additionalChannelCosts = 0,
}: {
  requiredNet: number;
  discountFactor?: number;
  buyerShipping?: number;
  percentageFees?: number;
  fixedFees?: number;
  feeVatRate?: number;
  additionalChannelCosts?: number;
}) {
  const d = discountFactor;
  const denominator = 1 - (1 + feeVatRate) * percentageFees;
  if (!(d > 0) || denominator <= EPSILON)
    throw new Error('INVALID_CHANNEL_FEE_CONFIGURATION');
  return (
    ((requiredNet + additionalChannelCosts + (1 + feeVatRate) * fixedFees) /
      denominator -
      buyerShipping) /
    d
  );
}

export function calculateChannelNet({
  regularPrice,
  discountFactor = 1,
  buyerShipping = 0,
  percentageFees = 0,
  fixedFees = 0,
  feeVatRate = 0,
  additionalChannelCosts = 0,
}: {
  regularPrice: number;
  discountFactor?: number;
  buyerShipping?: number;
  percentageFees?: number;
  fixedFees?: number;
  feeVatRate?: number;
  additionalChannelCosts?: number;
}) {
  const gross = discountFactor * regularPrice + buyerShipping;
  return (
    gross -
    (1 + feeVatRate) * (percentageFees * gross + fixedFees) -
    additionalChannelCosts
  );
}

export function calculateMarketCostPerSale(
  standFee: number,
  travelCost: number,
  additionalMarketCosts: number,
  expectedSales: number,
) {
  if (!(expectedSales > 0)) throw new Error('EXPECTED_SALES_REQUIRED');
  return (
    (Math.max(0, standFee) +
      Math.max(0, travelCost) +
      Math.max(0, additionalMarketCosts)) /
    expectedSales
  );
}

export function calculatePresenceFactor(
  input: Pick<
    PhysicalPricingInput,
    | 'category'
    | 'lengthCm'
    | 'widthCm'
    | 'heightCm'
    | 'referenceLongestCm'
    | 'referenceVolumeCm3'
    | 'categorySampleLongestCm'
    | 'categorySampleVolumesCm3'
    | 'hollowBody'
  >,
  config = DEFAULT_PRICING_CONFIG,
) {
  const dimensions = [input.lengthCm, input.widthCm, input.heightCm];
  if (dimensions.some((value) => !(typeof value === 'number' && value > 0)))
    return null;
  const [length, width, height] = dimensions as number[];
  const longestDimension = Math.max(length, width, height);
  const boundingVolume = length * width * height;
  const sampleLongest = input.categorySampleLongestCm || [];
  const sampleVolumes = input.categorySampleVolumesCm3 || [];
  const referenceLongest =
    (sampleLongest.length >= 5 ? median(sampleLongest) : null) ||
    input.referenceLongestCm ||
    config.presence.referenceLongestCm[input.category];
  const referenceVolume =
    (sampleVolumes.length >= 5 ? median(sampleVolumes) : null) ||
    input.referenceVolumeCm3 ||
    null;
  const volumeComponent = referenceVolume
    ? Math.cbrt(boundingVolume) / Math.cbrt(referenceVolume)
    : 1;
  const exponent =
    config.presence.longestDimensionWeight *
      Math.log(longestDimension / referenceLongest) +
    config.presence.volumeWeight * Math.log(volumeComponent);
  let factor = clamp(
    Math.exp(exponent),
    config.presence.minFactor,
    config.presence.maxFactor,
  );
  if (input.hollowBody) {
    factor = Math.max(
      factor,
      clamp(
        Math.pow(longestDimension / referenceLongest, 0.55),
        config.presence.minFactor,
        config.presence.maxFactor,
      ),
    );
  }
  return {
    factor,
    longestDimension,
    boundingVolume,
    referenceLongest,
    referenceVolume,
    volumeComponent,
  };
}

export function calculateValueFactor(
  value: ValueInputs,
  config = DEFAULT_PRICING_CONFIG,
) {
  const weights = config.valueWeights;
  return Math.min(
    weights.maxFactor,
    1 +
      weights.complexity * clamp(value.complexity) +
      weights.functionValue * clamp(value.functionValue) +
      weights.giftValue * clamp(value.giftValue) +
      weights.collectorValue * clamp(value.collectorValue) +
      weights.personalization * clamp(value.personalization) +
      weights.finish * clamp(value.finish),
  );
}

export function calculateDemandCompetitionFactor(
  demand: Demand,
  competition: Competition,
  config = DEFAULT_PRICING_CONFIG,
) {
  if (demand === 'unknown' || competition === 'unknown' || competition === 'medium')
    return config.demandCompetition.unknown;
  const highDemand = ['known', 'very_known', 'trend'].includes(demand);
  if (highDemand && competition === 'high')
    return config.demandCompetition.highDemandHighCompetition;
  if (highDemand && competition === 'low')
    return config.demandCompetition.highDemandLowCompetition;
  if (!highDemand && competition === 'high')
    return config.demandCompetition.lowDemandHighCompetition;
  return config.demandCompetition.lowDemandLowCompetition;
}

export function interpolateQuantile(quantiles: MarketQuantiles, q: number) {
  const points: Array<[number, number]> = [
    [0.25, quantiles.p25],
    [0.5, quantiles.median],
    [0.75, quantiles.p75],
    [0.9, quantiles.p90],
  ];
  const position = clamp(q, 0.25, 0.9);
  for (let index = 1; index < points.length; index += 1) {
    if (position <= points[index][0]) {
      const [q0, p0] = points[index - 1];
      const [q1, p1] = points[index];
      return p0 + ((position - q0) / (q1 - q0)) * (p1 - p0);
    }
  }
  return quantiles.p90;
}

export function quantilePositionForTier(tier: ProductTier, highEndCollector = false) {
  if (highEndCollector) return 0.9;
  if (tier === 'ultra') return 0.75;
  if (tier === 'premium') return 0.625;
  return 0.375;
}

export function calculatePhysicalMarketAnchor({
  selectedQuantile,
  presenceFactor,
  valueFactor,
  demandCompetitionFactor,
}: {
  selectedQuantile: number;
  presenceFactor: number;
  valueFactor: number;
  demandCompetitionFactor: number;
}) {
  return selectedQuantile * presenceFactor * valueFactor * demandCompetitionFactor;
}

export function roundMarketPrice(raw: number) {
  if (raw < 5) return Math.ceil(raw / 0.5 - EPSILON) * 0.5;
  return Math.ceil(raw / 5 - EPSILON) * 5;
}

export function roundEtsyPhysical(raw: number, collectible = false) {
  if (collectible || raw >= 50) return Math.ceil(raw / 5 - EPSILON) * 5;
  const base = Math.floor(raw);
  for (let euro = Math.max(0, base - 1); euro <= base + 2; euro += 1) {
    for (const ending of [0.9, 0.95]) {
      const candidate = euro + ending;
      if (candidate + EPSILON >= raw) return money(candidate);
    }
  }
  return money(Math.ceil(raw));
}

export function roundCommercialPrice(raw: number) {
  return Math.ceil(raw * 2 - EPSILON) / 2;
}

export function roundForChannel(
  raw: number,
  channel: SalesChannel,
  collectible = false,
  config = DEFAULT_PRICING_CONFIG,
) {
  const strategy = config.channels[channel].roundingStrategy;
  if (strategy === 'market') return roundMarketPrice(raw);
  if (strategy === 'etsy-physical') return roundEtsyPhysical(raw, collectible);
  return roundCommercialPrice(raw);
}

function configuredChannel(
  channel: SalesChannel,
  overrides: Partial<ChannelPricingConfig> | undefined,
  config: PricingConfig,
  offsiteRate = 0,
) {
  const base = { ...config.channels[channel], ...overrides };
  if (channel === 'etsy') {
    base.percentageFees =
      config.etsy.transactionRate + config.etsy.paymentRate + offsiteRate;
    base.fixedFees = config.etsy.paymentFixed + config.etsy.listingFeeEUR;
    base.feeVatRate = config.etsy.feeVatRate;
  }
  return base;
}

export function calculateDiscountSafety({
  regularPrice,
  cogs,
  minimumContribution,
  channel,
  buyerShipping = 0,
  channelNonCogsCost = 0,
  channelOverrides,
  offsiteRate = 0,
  config = DEFAULT_PRICING_CONFIG,
}: {
  regularPrice: number;
  cogs: number;
  minimumContribution: number;
  channel: SalesChannel;
  buyerShipping?: number;
  channelNonCogsCost?: number;
  channelOverrides?: Partial<ChannelPricingConfig>;
  offsiteRate?: number;
  config?: PricingConfig;
}) {
  const fees = configuredChannel(channel, channelOverrides, config, offsiteRate);
  const calculate = (discountRate: number): DiscountResult => {
    const salePrice = regularPrice * (1 - discountRate);
    const netRevenue = calculateChannelNet({
      regularPrice,
      discountFactor: 1 - discountRate,
      buyerShipping,
      percentageFees: fees.percentageFees,
      fixedFees: fees.fixedFees,
      feeVatRate: fees.feeVatRate,
      additionalChannelCosts: channelNonCogsCost + fees.nonCogsCosts,
    });
    const contribution = netRevenue - cogs;
    return {
      discountRate,
      salePrice: money(salePrice),
      netRevenue: money(netRevenue),
      contribution: money(contribution),
      state:
        contribution + EPSILON >= minimumContribution
          ? 'GREEN'
          : contribution + EPSILON >= 0
            ? 'YELLOW'
            : 'RED',
    };
  };
  let low = 0;
  let high = 0.95;
  for (let index = 0; index < 50; index += 1) {
    const middle = (low + high) / 2;
    if (calculate(middle).contribution + EPSILON >= minimumContribution)
      low = middle;
    else high = middle;
  }
  return {
    tenPercent: calculate(0.1),
    fifteenPercent: calculate(0.15),
    twentyPercent: calculate(0.2),
    maximumSafeDiscount: Math.floor(low * 1000) / 1000,
  };
}

export function calculatePhysicalRecommendation(
  input: PhysicalPricingInput,
): PriceRecommendation {
  const config = input.config || DEFAULT_PRICING_CONFIG;
  const minimumContribution = calculateMinimumContribution(input.cogs, config);
  const requiredNet = calculateRequiredNet(
    input.cogs,
    minimumContribution,
    input.channelNonCogsCost,
  );
  const fees = configuredChannel(
    input.channel,
    input.channelOverrides,
    config,
    input.offsiteRate || 0,
  );
  const reserve = fees.discountReserve;
  const floorPrice = invertChannelFees({
    requiredNet,
    discountFactor: 1 - reserve,
    buyerShipping: input.buyerShipping,
    percentageFees: fees.percentageFees,
    fixedFees: fees.fixedFees,
    feeVatRate: fees.feeVatRate,
    additionalChannelCosts: fees.nonCogsCosts,
  });
  const presence = calculatePresenceFactor(input, config);
  const valueFactor = calculateValueFactor(input.value, config);
  const demandCompetitionFactor = calculateDemandCompetitionFactor(
    input.demand,
    input.competition,
    config,
  );
  const quantilePosition = quantilePositionForTier(
    input.tier,
    input.highEndCollector,
  );
  const categoryQuantiles = config.marketQuantiles[input.category];
  const selectedQuantile = interpolateQuantile(categoryQuantiles, quantilePosition);
  const marketPrice = presence
    ? calculatePhysicalMarketAnchor({
        selectedQuantile,
        presenceFactor: presence.factor,
        valueFactor,
        demandCompetitionFactor,
      })
    : undefined;
  const rawPrice = Math.max(floorPrice, marketPrice ?? -Infinity);
  const recommendedPrice = roundForChannel(
    rawPrice,
    input.channel,
    Boolean(input.highEndCollector || input.tier === 'ultra'),
    config,
  );
  const currentNet = calculateChannelNet({
    regularPrice: recommendedPrice,
    buyerShipping: input.buyerShipping,
    percentageFees: fees.percentageFees,
    fixedFees: fees.fixedFees,
    feeVatRate: fees.feeVatRate,
    additionalChannelCosts:
      (input.channelNonCogsCost || 0) + fees.nonCogsCosts,
  });
  const profit = currentNet - input.cogs;
  const warnings: string[] = [];
  if (!presence) warnings.push('Maße fehlen; Marktanker nicht berechnet.');
  if (input.demand === 'unknown' || input.competition === 'unknown')
    warnings.push('Nachfrage oder Konkurrenz ist unbekannt.');
  const status =
    floorPrice > categoryQuantiles.p90 * 1.2 ? 'REVIEW_MARKET_FIT' : 'OK';
  const etsyScenarios =
    input.channel === 'etsy'
      ? Object.fromEntries(
          config.etsy.offsiteRates.map((rate) => {
            const scenarioFees = configuredChannel('etsy', input.channelOverrides, config, rate);
            return [
              rate === 0 ? 'normal' : `offsite${Math.round(rate * 100)}`,
              money(
                invertChannelFees({
                  requiredNet,
                  discountFactor: 1 - scenarioFees.discountReserve,
                  buyerShipping: input.buyerShipping,
                  percentageFees: scenarioFees.percentageFees,
                  fixedFees: scenarioFees.fixedFees,
                  feeVatRate: scenarioFees.feeVatRate,
                  additionalChannelCosts: scenarioFees.nonCogsCosts,
                }),
              ),
            ];
          }),
        )
      : undefined;
  return {
    status,
    confidence: !presence
      ? 'low'
      : warnings.length || (input.categorySampleLongestCm?.length || 0) < 5
        ? 'medium'
        : 'high',
    channel: input.channel,
    cogs: money(input.cogs),
    minimumContribution: money(minimumContribution),
    requiredNet: money(requiredNet),
    floorPrice: money(floorPrice),
    marketPrice: marketPrice == null ? undefined : money(marketPrice),
    rawPrice: money(rawPrice),
    recommendedPrice: money(recommendedPrice),
    expectedContribution: money(profit),
    expectedMargin: recommendedPrice > 0 ? profit / recommendedPrice : 0,
    markupRate: input.cogs > 0 ? profit / input.cogs : 0,
    marginRate: recommendedPrice > 0 ? profit / recommendedPrice : 0,
    diagnostics: {
      presenceFactor: presence?.factor,
      volumeComponent: presence?.volumeComponent,
      valueFactor,
      demandCompetitionFactor,
      selectedQuantile: money(selectedQuantile),
      selectedQuantilePosition: quantilePosition,
      roundingRule: fees.roundingStrategy,
      priceDriver: marketPrice != null && marketPrice > floorPrice ? 'market' : 'floor',
      warnings,
      etsyScenarios,
    },
    discountSafety: calculateDiscountSafety({
      regularPrice: recommendedPrice,
      cogs: input.cogs,
      minimumContribution,
      channel: input.channel,
      buyerShipping: input.buyerShipping,
      channelNonCogsCost: input.channelNonCogsCost,
      channelOverrides: input.channelOverrides,
      offsiteRate: input.offsiteRate,
      config,
    }),
  };
}

export function calculateDigitalScore(input: DigitalPricingInput) {
  return (
    0.2 * clamp(input.modelComplexity) +
    0.15 * clamp(input.demand) +
    0.2 * clamp(input.differentiation) +
    0.2 * clamp(input.utility) +
    0.25 * clamp(input.printReadiness)
  );
}

export function roundEtsyDigital(
  rawPrice: number,
  isLeadProduct = false,
  config = DEFAULT_PRICING_CONFIG,
) {
  if (isLeadProduct && rawPrice <= config.digital.leadProductPrice)
    return config.digital.leadProductPrice;
  const ladder = config.digital.priceLadder;
  const match = ladder.find((price) => price + EPSILON >= rawPrice);
  if (match != null) return match;
  return Math.ceil((rawPrice - 24.9) / 5 - EPSILON) * 5 + 24.9;
}

export function calculateDigitalRecommendation(
  input: DigitalPricingInput,
): PriceRecommendation {
  const config = input.config || DEFAULT_PRICING_CONFIG;
  if (!input.license?.digitalRedistributionAllowed) {
    return {
      status: 'BLOCKED_LICENSE',
      confidence: 'low',
      channel: input.channel,
      diagnostics: { warnings: ['Digitale Weiterverkaufsrechte sind nicht belegt.'] },
    };
  }
  const score = calculateDigitalScore(input);
  const q = clamp(0.25 + 0.65 * score, 0.25, 0.9);
  const selectedQuantile = interpolateQuantile(config.marketQuantiles.digital, q);
  const demandCompetitionFactor = calculateDemandCompetitionFactor(
    input.demandClass || 'unknown',
    input.competition,
    config,
  );
  // Der digitale Marktanker ist bereits ein sichtbarer Kanalpreis und wird nicht
  // ein zweites Mal durch Plattformgebühren invertiert.
  const marketPrice = selectedQuantile * demandCompetitionFactor;
  const recommendedPrice =
    input.channel === 'etsy'
      ? roundEtsyDigital(marketPrice, input.isLeadProduct, config)
      : roundForChannel(marketPrice, input.channel, false, config);
  return {
    status: 'OK',
    confidence:
      input.competition === 'unknown' || !input.license.evidence ? 'medium' : 'high',
    channel: input.channel,
    marketPrice: money(marketPrice),
    rawPrice: money(marketPrice),
    recommendedPrice: money(recommendedPrice),
    diagnostics: {
      selectedQuantile: money(selectedQuantile),
      selectedQuantilePosition: q,
      demandCompetitionFactor,
      priceDriver: 'market',
      roundingRule: input.channel === 'etsy' ? 'etsy-digital-ladder' : 'commercial',
      warnings: input.license.buyerCommercialUseAllowed
        ? []
        : ['Endkundenlizenz ist nur für private Nutzung vorgesehen.'],
    },
  };
}

export function calculateDefectScore(
  defects: DefectInputs,
  config = DEFAULT_PRICING_CONFIG,
) {
  const weights = config.defect.weights;
  return (
    weights.aesthetic * clamp(defects.aestheticVisibility) +
    weights.functional * clamp(defects.functionalImpact) +
    weights.structural * clamp(defects.structuralRisk) +
    weights.nonRepairable * clamp(defects.nonRepairability) +
    weights.giftCollectorLoss * clamp(defects.giftCollectorLoss)
  );
}

export function calculateDefectFactor(
  defectScore: number,
  config = DEFAULT_PRICING_CONFIG,
) {
  return clamp(
    Math.exp(-config.defect.exponent * defectScore),
    0.35,
    0.9,
  );
}

export function calculateBWarePrice(input: BWareInput): BWareResult {
  const config = input.config || DEFAULT_PRICING_CONFIG;
  if (input.safetyRisk) return { status: 'BLOCKED_UNSAFE' };
  if (input.structurallyUnreliable) return { status: 'BLOCKED_STRUCTURAL' };
  if (input.mainFunctionLost) return { status: 'REJECT_OR_RECLASSIFY' };
  if (!input.defectCanBeClearlyDisclosed) return { status: 'BLOCKED_DISCLOSURE' };
  const fees = configuredChannel(input.channel, input.channelOverrides, config);
  const economicRecoveryFloor = invertChannelFees({
    requiredNet: Math.max(0, input.futureNonFeeCosts),
    buyerShipping: input.buyerShipping,
    percentageFees: fees.percentageFees,
    fixedFees: fees.fixedFees,
    feeVatRate: fees.feeVatRate,
    additionalChannelCosts: fees.nonCogsCosts,
  });
  const defectScore = calculateDefectScore(input.defects, config);
  const defectFactor = calculateDefectFactor(defectScore, config);
  const rawPrice = Math.max(economicRecoveryFloor, input.normalPrice * defectFactor);
  return {
    status: 'OK',
    defectScore,
    defectFactor,
    economicRecoveryFloor: money(economicRecoveryFloor),
    rawPrice: money(rawPrice),
    recommendedPrice: money(
      roundForChannel(rawPrice, input.channel, input.collectible, config),
    ),
  };
}

export function suggestDefectScores(
  affectedArea: string,
  visibility: 'kaum' | 'leicht' | 'deutlich' | 'sehr' | 'identitaet',
): DefectInputs {
  const visibilityScore = { kaum: 0.1, leicht: 0.25, deutlich: 0.55, sehr: 0.8, identitaet: 1 }[visibility];
  const area = affectedArea.toLocaleLowerCase('de');
  const identity = /gesicht|augen|brille|krone|hut|instrument|hand|identität|identitaet|charakteristisch/.test(area);
  const structural = /tragend/.test(area);
  const functional = /funktion/.test(area);
  return {
    aestheticVisibility: Math.max(visibilityScore, identity ? 0.7 : 0),
    functionalImpact: functional ? 0.75 : structural ? 0.35 : 0.05,
    structuralRisk: structural ? 0.75 : 0,
    nonRepairability: identity ? 0.65 : 0.35,
    giftCollectorLoss: identity ? 0.9 : visibilityScore * 0.65,
  };
}

function daysBetween(earlier: string, later: Date) {
  const date = new Date(earlier);
  return Number.isNaN(date.getTime())
    ? Infinity
    : (later.getTime() - date.getTime()) / 86_400_000;
}

function quantityInWindow(sales: PortfolioSale[], asOf: Date, from: number, to: number) {
  return sales.reduce((sum, sale) => {
    const age = daysBetween(sale.soldAt, asOf);
    return age >= from && age < to ? sum + Math.max(0, sale.quantity) : sum;
  }, 0);
}

export function evaluatePortfolioSignals(
  sales: PortfolioSale[],
  asOf = new Date(),
  activeSeason?: string | null,
): PortfolioSignal[] {
  const primary = new Map<string, PortfolioSale[]>();
  for (const sale of sales) {
    if (!sale.soldAt || !sale.channel) continue;
    const sku = sale.sku || sale.productId || 'unassigned';
    const key = `${sku}:${sale.variantId || 'all'}:${sale.channel}`;
    primary.set(key, [...(primary.get(key) || []), sale]);
  }
  const signals: PortfolioSignal[] = [];
  for (const group of primary.values()) {
    const first = group[0];
    const sku = first.sku || first.productId || 'Ohne SKU';
    let considered = group;
    let aggregatedAt: PortfolioSignal['aggregatedAt'] = 'variant';
    if (quantityInWindow(group, asOf, 0, 90) < 5) {
      const sameSku = sales.filter(
        (sale) =>
          (sale.sku || sale.productId || 'unassigned') === sku &&
          sale.channel === first.channel,
      );
      considered = sameSku;
      aggregatedAt = 'sku';
      if (quantityInWindow(sameSku, asOf, 0, 90) < 5 && first.familyId) {
        considered = sales.filter(
          (sale) => sale.familyId === first.familyId && sale.channel === first.channel,
        );
        aggregatedAt = 'family';
      }
    }
    const sales30 = quantityInWindow(considered, asOf, 0, 30);
    const previous30 = quantityInWindow(considered, asOf, 30, 60);
    const sales60 = sales30 + previous30;
    const sales90 = sales60 + quantityInWindow(considered, asOf, 60, 90);
    const trend30 = Math.log((sales30 + 0.5) / (previous30 + 0.5));
    const priced = considered.filter((sale) => typeof sale.realizedPrice === 'number');
    const realizedPrice = priced.length
      ? priced.reduce((sum, sale) => sum + Number(sale.realizedPrice) * sale.quantity, 0) /
        priced.reduce((sum, sale) => sum + sale.quantity, 0)
      : null;
    const marginRows = considered.filter(
      (sale) =>
        typeof sale.realizedPrice === 'number' && typeof sale.cogsSnapshot === 'number',
    );
    const contributionMargin = marginRows.length
      ? marginRows.reduce(
          (sum, sale) =>
            sum +
            (Number(sale.realizedPrice) -
              Number(sale.fees || 0) -
              Number(sale.cogsSnapshot)) *
              sale.quantity,
          0,
        ) /
        marginRows.reduce((sum, sale) => sum + sale.quantity, 0)
      : null;
    const launchedAt = considered.map((sale) => sale.launchedAt).find(Boolean);
    const coldStart = launchedAt ? daysBetween(launchedAt, asOf) < 90 : false;
    const season = considered.map((sale) => sale.season).find(Boolean);
    const normalizedSeason = (season || '').toLocaleLowerCase('de');
    const normalizedActiveSeason = (activeSeason || '').toLocaleLowerCase('de');
    const outsideSeason = Boolean(
      normalizedSeason &&
        !/ganz|immer|all.?year/.test(normalizedSeason) &&
        normalizedActiveSeason &&
        !normalizedActiveSeason.includes(normalizedSeason) &&
        !normalizedSeason.includes(normalizedActiveSeason),
    );
    let state: PortfolioState = 'HOLD';
    let priority: PortfolioSignal['priority'] = 'optimization';
    let reason = 'Datenlage beobachten; keine automatische Preisänderung.';
    if (coldStart) reason = 'Produkt befindet sich im 90-Tage-Kaltstart.';
    else if (outsideSeason) reason = 'Saisonartikel wird außerhalb seiner Saison nicht abgewertet.';
    else if (contributionMargin != null && contributionMargin < 0) {
      state = 'INVESTIGATE';
      priority = 'check';
      reason = 'Realisierter Deckungsbeitrag ist negativ; Kosten und Kanal prüfen.';
    } else if (sales30 >= 5 && trend30 > Math.log(1.35)) {
      state = 'PROTECT_TEST_UP';
      priority = 'chance';
      reason = 'Nachfrage steigt; kleine kontrollierte Preiserhöhung testen.';
    } else if (sales90 === 0) {
      const knownAge = launchedAt ? daysBetween(launchedAt, asOf) : 0;
      state = knownAge >= 180 ? 'RETIRE_PAUSE' : 'INVESTIGATE';
      priority = 'check';
      reason = 'Keine Verkäufe im 90-Tage-Fenster; Angebot und Positionierung prüfen.';
    } else if (sales90 < 5) {
      state = 'BUNDLE_CANDIDATE';
      reason = 'Kleine Stichprobe; Bündelung statt pauschaler Preissenkung prüfen.';
    } else if (trend30 < Math.log(0.65)) {
      state = 'REPRICE_DOWN_TEST';
      priority = 'check';
      reason = 'Deutlicher Rückgang bei belastbarer Stichprobe; kontrollierten Preistest prüfen.';
    }
    signals.push({
      key: `${sku}:${first.variantId || 'all'}:${first.channel}`,
      sku,
      variantId: first.variantId,
      channel: first.channel,
      sales30,
      sales60,
      sales90,
      previous30,
      trend30,
      realizedPrice: realizedPrice == null ? null : money(realizedPrice),
      contributionMargin:
        contributionMargin == null ? null : money(contributionMargin),
      state,
      priority,
      reason,
      aggregatedAt,
    });
  }
  const rank = { chance: 0, check: 1, optimization: 2 };
  return signals
    .sort((a, b) => rank[a.priority] - rank[b.priority] || b.sales90 - a.sales90)
    .slice(0, 5);
}
