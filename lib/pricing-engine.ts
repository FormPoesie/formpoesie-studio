import {
  DEFAULT_PRICING_CONFIG,
  type ChannelPricingConfig,
  type MarketCategory,
  type MarketPsychology,
  type MarketQuantiles,
  type PricingConfig,
  type SalesChannel,
} from './pricing-config';

export type Confidence = 'high' | 'medium' | 'low';
export type PricingStatus =
  | 'OK'
  | 'MISSING_COGS'
  | 'INVALID_COGS'
  | 'INVALID_DIMENSIONS'
  | 'INVALID_PRICING_INPUT'
  | 'INVALID_CHANNEL_CONFIG'
  | 'REVIEW'
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
export type ImpactType = 'SOLID' | 'DETAILED' | 'PREMIUM_IMPACT';
export type DemandPerformanceStatus = 'HIGH' | 'NORMAL' | 'LOW' | 'UNKNOWN';

export type BundleType = 'single' | 'multipack' | 'semantic_set';
export type PricingRole = 'base' | 'bundle';
export type PricingSegment =
  | 'small_functional'
  | 'small_item'
  | 'functional'
  | 'figure'
  | 'historical_bust'
  | 'gothic'
  | 'gift'
  | 'hollow';

export interface ProductVariant {
  id?: string | number;
  sku?: string;
  activePrice?: number;
  cogs?: number;
  unitCount?: number;
  bundleType?: BundleType;
  pricingRole?: PricingRole;
  marketCeiling?: number;
}

export interface PremiumProductLeitplanke {
  targetBasePrice: number;
  scaleWithWeight: boolean;
  baseWeightGrams: number;
}

export type ClassificationContext = {
  dimensions?: { l: number; w: number; h: number };
  keywords: string[];
  isPremiumOrArt: boolean;
};

export class VariantParser {
  private static readonly MULTIPACK_PATTERNS = [
    /(?:^|\s)(\d+)\s*(?:er|x|stk\.?|stück|pack)(?:\s*(?:set|pack))?(?:\s|$)/i,
    /(?:^|\s)(?:pack|set)\s*(?:von\s*)?(\d+)(?:\s|$)/i,
    /(?:^|\s)x\s*(\d+)(?:\s|$)/i,
  ];

  static parseMetadata(variantName: string): Partial<ProductVariant> {
    const cleanName = variantName.toLocaleLowerCase('de').trim();
    for (const pattern of this.MULTIPACK_PATTERNS) {
      const count = Number(cleanName.match(pattern)?.[1]);
      if (Number.isInteger(count) && count > 1)
        return {
          unitCount: count,
          bundleType: 'multipack',
          pricingRole: 'bundle',
        };
    }
    return { unitCount: 1, bundleType: 'single', pricingRole: 'base' };
  }
}

export class SegmentClassifier {
  static classify(context: ClassificationContext): PricingSegment {
    const l = context.dimensions?.l ?? 0;
    const w = context.dimensions?.w ?? 0;
    const h = context.dimensions?.h ?? 0;
    const volume = l * w * h;
    const keywords = context.keywords.map((keyword) =>
      keyword.toLocaleLowerCase('de'),
    );
    const hasSmallDimensions = l > 0 && Math.max(l, w, h) <= 6;
    const hasSmallVolume = volume > 0 && volume <= 100;
    const functionalKeywords = [
      'clip',
      'klammer',
      'haken',
      'halter',
      'magnet',
      'kabel',
      'beutelclip',
    ];
    const hasFunctionalSignal = keywords.some((keyword) =>
      functionalKeywords.some((signal) => keyword.includes(signal)),
    );
    if (!context.isPremiumOrArt) {
      if ((hasSmallDimensions || hasSmallVolume) && hasFunctionalSignal)
        return 'small_functional';
      if (hasSmallDimensions || hasSmallVolume) return 'small_item';
    }
    if (keywords.some((keyword) => keyword.includes('gothic'))) return 'gothic';
    if (keywords.some((keyword) => /büst|bust/.test(keyword)))
      return 'historical_bust';
    if (keywords.some((keyword) => /figur|skulptur/.test(keyword)))
      return 'figure';
    if (keywords.some((keyword) => /geschenk|gift/.test(keyword))) return 'gift';
    if (keywords.some((keyword) => /hohl|vase|hollow/.test(keyword))) return 'hollow';
    return 'functional';
  }
}

export type DemandPerformanceInput = {
  sales30: number;
  previous30: number;
  sales90: number;
  views30?: number | null;
  favorites30?: number | null;
  daysObserved?: number | null;
  stockProduced90?: number | null;
};

export type DemandPerformanceResult = {
  multiplier: number;
  status: DemandPerformanceStatus;
  source: 'PERFORMANCE' | 'DEFAULT';
  conversionRate?: number;
  favoriteVelocity?: number;
  stockTurnover?: number;
  evidence: string[];
};

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

export type ParameterSource = 'AUTO' | 'RESEARCH' | 'PORTFOLIO' | 'DEFAULT' | 'MANUAL' | 'REVIEW';

export interface PriceRecommendation {
  productId?: string;
  variantId?: string;
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
    impactMultiplier?: number;
    impactType?: ImpactType;
    demandIndex?: number;
    demandPerformanceStatus?: DemandPerformanceStatus;
    demandEvidence?: string[];
    demandCompetitionFactor?: number;
    selectedQuantile?: number;
    selectedQuantilePosition?: number;
    marketPsychology?: MarketPsychology;
    marketPsychologyShift?: number;
    roundingRule?: string;
    priceDriver?: 'floor' | 'market';
    volumeComponent?: number;
    warnings?: string[];
    etsyScenarios?: Record<string, number>;
    pricingSegment?: PricingSegment;
    marketCeiling?: number;
  };
  discountSafety?: {
    tenPercent: DiscountResult;
    fifteenPercent: DiscountResult;
    twentyPercent: DiscountResult;
    maximumSafeDiscount: number;
    maxDiscountBeforeMinimumContributionViolation: number;
    maxDiscountBeforeBreakEven: number;
  };
  parameterSources?: Record<string, ParameterSource>;
  calculatedAt?: string;
  pricingConfigVersion?: string;
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
  impactType?: ImpactType;
  demandPerformance?: DemandPerformanceInput;
  demand: Demand;
  competition: Competition;
  marketPsychology?: MarketPsychology;
  buyerShipping?: number;
  channelNonCogsCost?: number;
  channelOverrides?: Partial<ChannelPricingConfig>;
  offsiteRate?: 0 | 0.12 | 0.15;
  config?: PricingConfig;
  parameterSources?: Record<string, ParameterSource>;
  keywords?: string[];
  isPremiumOrArt?: boolean;
  weightGrams?: number | null;
  marketCeiling?: number | null;
  premiumLeitplanke?: PremiumProductLeitplanke | null;
};

export type DigitalLicense = {
  /** Eigene Entwürfe benötigen keinen Nachweis eines fremden Weiterverkaufsrechts. */
  isOwnDesign?: boolean;
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
  marketPsychology?: MarketPsychology;
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
  micro = false,
) {
  if (!Number.isFinite(cogs) || cogs < 0) throw new Error('INVALID_COGS');
  const economicClass = micro ? config.physical.micro : config.physical.normal;
  return Math.max(
    economicClass.minimumAbsoluteContribution,
    Math.max(0, cogs) * economicClass.minimumCogsContributionRate,
  );
}

export function roundToPsychologicalCeil(price: number) {
  const base = Math.floor(price);
  const candidate = base + 0.9;
  return money(candidate + EPSILON >= price ? candidate : base + 1.9);
}

export function calculateMultipackPrice(
  baseItemPrice: number,
  totalCogs: number,
  quantity: number,
  config = DEFAULT_PRICING_CONFIG,
) {
  if (quantity <= 1) return roundToPsychologicalCeil(baseItemPrice);
  const factor =
    quantity >= 10
      ? config.bundles.degressions[10]
      : quantity >= 5
        ? config.bundles.degressions[5]
        : quantity >= 3
          ? config.bundles.degressions[3]
          : 1;
  const rawBundlePrice = baseItemPrice * quantity * factor;
  const absoluteFloor =
    Math.max(0, totalCogs) + config.physical.micro.minimumAbsoluteContribution;
  return roundToPsychologicalCeil(Math.max(rawBundlePrice, absoluteFloor));
}

export function calculatePremiumGuidePrice(
  guide: PremiumProductLeitplanke,
  weightGrams?: number | null,
) {
  if (!guide.scaleWithWeight || !(weightGrams && guide.baseWeightGrams > 0))
    return Math.max(0, guide.targetBasePrice);
  return Math.max(
    0,
    guide.targetBasePrice * Math.max(1, weightGrams / guide.baseWeightGrams),
  );
}

export function calculateRequiredNet(
  cogs: number,
  minimumContribution: number,
  channelNonCogsCost = 0,
) {
  if (![cogs, minimumContribution, channelNonCogsCost].every(Number.isFinite) ||
      cogs < 0 || minimumContribution < 0 || channelNonCogsCost < 0)
    throw new Error('INVALID_PRICING_INPUT');
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
  if (![requiredNet, discountFactor, buyerShipping, percentageFees, fixedFees,
        feeVatRate, additionalChannelCosts].every(Number.isFinite) ||
      requiredNet < 0 || buyerShipping < 0 || percentageFees < 0 ||
      fixedFees < 0 || feeVatRate < 0 || additionalChannelCosts < 0 ||
      discountFactor > 1)
    throw new Error('INVALID_CHANNEL_FEE_CONFIGURATION');
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
  impactMultiplier = 1,
  demandIndex = 1,
}: {
  selectedQuantile: number;
  presenceFactor: number;
  valueFactor: number;
  demandCompetitionFactor: number;
  impactMultiplier?: number;
  demandIndex?: number;
}) {
  return selectedQuantile * presenceFactor * impactMultiplier * valueFactor *
    demandCompetitionFactor * demandIndex;
}

export function calculateImpactMultiplier(
  impactType: ImpactType,
  config = DEFAULT_PRICING_CONFIG,
) {
  if (impactType === 'SOLID') return config.impact.solid;
  if (impactType === 'PREMIUM_IMPACT') return config.impact.premiumImpact;
  return config.impact.detailed;
}

export function calculateDemandPerformance(
  input: DemandPerformanceInput,
  config = DEFAULT_PRICING_CONFIG,
): DemandPerformanceResult {
  const values = [input.sales30, input.previous30, input.sales90];
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error('INVALID_DEMAND_PERFORMANCE');
  const views = input.views30 ?? null;
  const favorites = input.favorites30 ?? null;
  const days = input.daysObserved ?? 30;
  const conversionRate = views != null && views > 0 ? input.sales30 / views : undefined;
  const favoriteVelocity = favorites != null && days > 0 ? favorites / days : undefined;
  const stockTurnover = input.stockProduced90 != null && input.stockProduced90 > 0
    ? input.sales90 / input.stockProduced90
    : undefined;
  const evidence: string[] = [];
  if (conversionRate != null) evidence.push(`Conversion ${(conversionRate * 100).toFixed(1)} %`);
  if (favoriteVelocity != null) evidence.push(`${favoriteVelocity.toFixed(2)} Favoriten/Tag`);
  if (stockTurnover != null) evidence.push(`Lagerumschlag ${(stockTurnover * 100).toFixed(0)} %`);
  const enoughViews = views != null && views >= config.demandPerformance.minimumReliableViews;
  const enoughSales = input.sales90 >= config.demandPerformance.minimumReliableSales;
  const trend = Math.log((input.sales30 + 0.5) / (input.previous30 + 0.5));
  const high = (enoughViews && conversionRate != null && conversionRate >= config.demandPerformance.highConversionRate) ||
    (favoriteVelocity != null && favoriteVelocity >= config.demandPerformance.highFavoriteVelocity) ||
    (enoughSales && trend > Math.log(1.35));
  const low = enoughViews && conversionRate != null && conversionRate <= config.demandPerformance.lowConversionRate &&
    (favoriteVelocity == null || favoriteVelocity <= config.demandPerformance.lowFavoriteVelocity);
  if (high) return { multiplier: config.demandPerformance.high, status: 'HIGH', source: 'PERFORMANCE', conversionRate, favoriteVelocity, stockTurnover, evidence };
  if (low) return { multiplier: config.demandPerformance.low, status: 'LOW', source: 'PERFORMANCE', conversionRate, favoriteVelocity, stockTurnover, evidence };
  if (enoughSales || enoughViews) return { multiplier: config.demandPerformance.normal, status: 'NORMAL', source: 'PERFORMANCE', conversionRate, favoriteVelocity, stockTurnover, evidence };
  return { multiplier: config.demandPerformance.normal, status: 'UNKNOWN', source: 'DEFAULT', conversionRate, favoriteVelocity, stockTurnover,
    evidence: ['Zu wenig reale Klick- oder Verkaufsdaten; neutraler Faktor 1,00.'] };
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

export function roundDirectPrice(raw: number) {
  return Math.ceil(raw * 2 - EPSILON) / 2;
}

export function roundVintedPrice(raw: number) {
  return Math.ceil(raw - EPSILON);
}

export function roundEbayPrice(raw: number) {
  const candidate = Math.floor(raw) + 0.99;
  return money(candidate + EPSILON >= raw ? candidate : candidate + 1);
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
  if (strategy === 'vinted') return roundVintedPrice(raw);
  if (strategy === 'ebay') return roundEbayPrice(raw);
  return roundDirectPrice(raw);
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
  const maximumDiscountFor = (minimum: number) => {
    let low = 0;
    let high = 0.95;
    for (let index = 0; index < 50; index += 1) {
      const middle = (low + high) / 2;
      if (calculate(middle).contribution + EPSILON >= minimum) low = middle;
      else high = middle;
    }
    return Math.floor(low * 1000) / 1000;
  };
  const contributionLimit = maximumDiscountFor(minimumContribution);
  const breakEvenLimit = maximumDiscountFor(0);
  return {
    tenPercent: calculate(0.1),
    fifteenPercent: calculate(0.15),
    twentyPercent: calculate(0.2),
    maximumSafeDiscount: contributionLimit,
    maxDiscountBeforeMinimumContributionViolation: contributionLimit,
    maxDiscountBeforeBreakEven: breakEvenLimit,
  };
}

export function calculatePhysicalRecommendation(
  input: PhysicalPricingInput,
): PriceRecommendation {
  const config = input.config || DEFAULT_PRICING_CONFIG;
  if (!config.channels[input.channel]) {
    return { status: 'INVALID_CHANNEL_CONFIG', confidence: 'low', channel: input.channel,
      diagnostics: { warnings: ['Unbekannte oder unvollständige Kanalkonfiguration.'] },
      parameterSources: input.parameterSources, pricingConfigVersion: config.version };
  }
  if (!Number.isFinite(input.cogs) || input.cogs < 0) {
    return { status: 'INVALID_COGS', confidence: 'low', channel: input.channel,
      diagnostics: { warnings: ['Herstellungskosten sind ungültig.'] },
      parameterSources: input.parameterSources, pricingConfigVersion: config.version };
  }
  if (input.cogs === 0) {
    return { status: 'MISSING_COGS', confidence: 'low', channel: input.channel,
      diagnostics: { warnings: ['COGS fehlen; physisches Pricing ist blockiert.'] },
      parameterSources: input.parameterSources, pricingConfigVersion: config.version };
  }
  if (Object.values(input.value).some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    return { status: 'INVALID_PRICING_INPUT', confidence: 'low', channel: input.channel,
      diagnostics: { warnings: ['Value-Parameter müssen zwischen 0 und 1 liegen.'] },
      parameterSources: input.parameterSources, pricingConfigVersion: config.version };
  }
  const segment = SegmentClassifier.classify({
    dimensions:
      input.lengthCm && input.widthCm && input.heightCm
        ? { l: input.lengthCm, w: input.widthCm, h: input.heightCm }
        : undefined,
    keywords: input.keywords || [input.category],
    isPremiumOrArt:
      input.isPremiumOrArt ??
      Boolean(input.highEndCollector || input.tier !== 'standard'),
  });
  const isMicro = segment === 'small_functional' || segment === 'small_item';
  const minimumContribution = calculateMinimumContribution(
    input.cogs,
    config,
    isMicro,
  );
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
  const presence = calculatePresenceFactor(
    isMicro && !input.referenceLongestCm
      ? { ...input, referenceLongestCm: 4.5 }
      : input,
    config,
  );
  const valueFactor = calculateValueFactor(input.value, config);
  const impactType = input.impactType || 'DETAILED';
  const impactMultiplier = calculateImpactMultiplier(impactType, config);
  const demandPerformance = calculateDemandPerformance(
    input.demandPerformance || { sales30: 0, previous30: 0, sales90: 0 },
    config,
  );
  const demandCompetitionFactor = calculateDemandCompetitionFactor(
    input.demand,
    input.competition,
    config,
  );
  const marketPsychology = input.marketPsychology || 'balanced';
  const marketPsychologyShift = config.marketPsychology[marketPsychology].quantileShift;
  const quantilePosition = clamp(quantilePositionForTier(
    input.tier,
    input.highEndCollector,
  ) + marketPsychologyShift, 0.25, 0.9);
  const categoryQuantiles = config.marketQuantiles[input.category];
  const selectedQuantile = interpolateQuantile(categoryQuantiles, quantilePosition);
  let marketPrice = calculatePhysicalMarketAnchor({
        selectedQuantile,
        presenceFactor: presence?.factor ?? 1,
        impactMultiplier,
        valueFactor,
        demandCompetitionFactor,
        demandIndex: demandPerformance.multiplier,
      });
  if (input.premiumLeitplanke)
    marketPrice = Math.max(
      marketPrice,
      calculatePremiumGuidePrice(input.premiumLeitplanke, input.weightGrams),
    );
  if (input.marketCeiling && input.marketCeiling > 0)
    marketPrice = Math.min(marketPrice, input.marketCeiling);
  const rawPrice = Math.max(floorPrice, marketPrice);
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
  if (!presence) warnings.push('Maße fehlen; neutraler Präsenzfaktor 1,00 verwendet.');
  if (input.demand === 'unknown' || input.competition === 'unknown')
    warnings.push('Nachfrage oder Konkurrenz ist unbekannt.');
  const status =
    input.marketCeiling && input.marketCeiling > 0 && floorPrice > input.marketCeiling
      ? 'REVIEW_MARKET_FIT'
      : floorPrice > categoryQuantiles.p90 * 1.2
        ? 'REVIEW_MARKET_FIT'
        : !presence
          ? 'REVIEW'
          : 'OK';
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
    marketPrice: money(marketPrice),
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
      impactMultiplier,
      impactType,
      demandIndex: demandPerformance.multiplier,
      demandPerformanceStatus: demandPerformance.status,
      demandEvidence: demandPerformance.evidence,
      demandCompetitionFactor,
      selectedQuantile: money(selectedQuantile),
      selectedQuantilePosition: quantilePosition,
      marketPsychology,
      marketPsychologyShift,
      roundingRule: fees.roundingStrategy,
      priceDriver: marketPrice > floorPrice ? 'market' : 'floor',
      warnings,
      etsyScenarios,
      pricingSegment: segment,
      marketCeiling: input.marketCeiling || undefined,
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
    parameterSources: input.parameterSources,
    pricingConfigVersion: config.version,
  };
}

export function calculateAllChannelRecommendations(
  input: Omit<PhysicalPricingInput, 'channel'> & {
    channelNonCogsCosts?: Partial<Record<SalesChannel, number>>;
    marketPsychologyByChannel?: Partial<Record<SalesChannel, MarketPsychology>>;
    demandPerformanceByChannel?: Partial<Record<SalesChannel, DemandPerformanceInput>>;
    demandByChannel?: Partial<Record<SalesChannel, Demand>>;
    competitionByChannel?: Partial<Record<SalesChannel, Competition>>;
  },
): Record<SalesChannel, PriceRecommendation> {
  const {
    channelNonCogsCosts,
    marketPsychologyByChannel,
    demandPerformanceByChannel,
    demandByChannel,
    competitionByChannel,
    ...shared
  } = input;
  return Object.fromEntries(
    (['etsy', 'direct', 'vinted', 'ebay', 'market'] as const).map((channel) => [
      channel,
      calculatePhysicalRecommendation({ ...shared, channel,
        marketPsychology: marketPsychologyByChannel?.[channel] ?? shared.marketPsychology,
        demandPerformance:
          demandPerformanceByChannel?.[channel] ?? shared.demandPerformance,
        demand: demandByChannel?.[channel] ?? shared.demand,
        competition: competitionByChannel?.[channel] ?? shared.competition,
        channelNonCogsCost: channelNonCogsCosts?.[channel] ?? shared.channelNonCogsCost }),
    ]),
  ) as Record<SalesChannel, PriceRecommendation>;
}

export function applyRecommendationsToDraft(
  currentDraft: Partial<Record<SalesChannel, number>>,
  recommendations: Partial<Record<SalesChannel, PriceRecommendation>>,
): Partial<Record<SalesChannel, number>> {
  const nextDraft = { ...currentDraft };
  for (const [channel, recommendation] of Object.entries(recommendations) as Array<[SalesChannel, PriceRecommendation]>) {
    if (typeof recommendation.recommendedPrice === 'number') nextDraft[channel] = recommendation.recommendedPrice;
  }
  return nextDraft;
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
  if (!config.channels[input.channel]) {
    return { status: 'INVALID_CHANNEL_CONFIG', confidence: 'low', channel: input.channel,
      diagnostics: { warnings: ['Unbekannte oder unvollständige Kanalkonfiguration.'] },
      pricingConfigVersion: config.version };
  }
  if ([input.modelComplexity, input.demand, input.differentiation, input.utility,
       input.printReadiness].some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    return { status: 'INVALID_PRICING_INPUT', confidence: 'low', channel: input.channel,
      diagnostics: { warnings: ['Digitalparameter müssen zwischen 0 und 1 liegen.'] },
      pricingConfigVersion: config.version };
  }
  if (
    !input.license?.isOwnDesign &&
    !input.license?.digitalRedistributionAllowed
  ) {
    return {
      status: 'BLOCKED_LICENSE',
      confidence: 'low',
      channel: input.channel,
      diagnostics: { warnings: ['Digitale Weiterverkaufsrechte sind nicht belegt.'] },
      pricingConfigVersion: config.version,
    };
  }
  const score = calculateDigitalScore(input);
  const marketPsychology = input.marketPsychology || 'balanced';
  const marketPsychologyShift = config.marketPsychology[marketPsychology].quantileShift;
  const q = clamp(0.25 + 0.65 * score + marketPsychologyShift, 0.25, 0.9);
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
      input.competition === 'unknown' ||
      (!input.license.isOwnDesign && !input.license.evidence)
        ? 'medium'
        : 'high',
    channel: input.channel,
    marketPrice: money(marketPrice),
    rawPrice: money(marketPrice),
    recommendedPrice: money(recommendedPrice),
    diagnostics: {
      selectedQuantile: money(selectedQuantile),
      selectedQuantilePosition: q,
      marketPsychology,
      marketPsychologyShift,
      demandCompetitionFactor,
      priceDriver: 'market',
      roundingRule: input.channel === 'etsy'
        ? 'etsy-digital-ladder'
        : config.channels[input.channel].roundingStrategy,
      warnings: input.license.buyerCommercialUseAllowed
        ? []
        : ['Endkundenlizenz ist nur für private Nutzung vorgesehen.'],
    },
    pricingConfigVersion: config.version,
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
