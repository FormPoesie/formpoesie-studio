import {
  calculatePhysicalRecommendation,
  type PhysicalPricingInput,
  type PriceRecommendation,
} from './pricing-engine';
import {
  DEFAULT_PRICING_CONFIG,
  type MarketCategory,
  type PricingConfig,
} from './pricing-config';
import type { ProductSnapshot } from './etsy-workflow';

export type CentralPriceView = {
  variantId: string;
  cogsCents: number | null;
  activePriceCents: number | null;
  recommendedPriceCents: number | null;
  floorPriceCents: number | null;
  marketAnchorCents: number | null;
  discountState: 'GREEN' | 'YELLOW' | 'RED' | null;
  status: string;
  confidence: string;
  reason: string;
  recommendationId?: string;
  createdAt?: string;
};

export function inferPricingCategory(
  product: Pick<ProductSnapshot, 'name' | 'productType' | 'buyerWorld'>,
): Exclude<MarketCategory, 'digital'> {
  const value =
    `${product.name} ${product.productType} ${product.buyerWorld}`.toLocaleLowerCase(
      'de',
    );
  if (/goth|horror|skelett|totenkopf|dämon/.test(value)) return 'gothic';
  if (/büste|bueste|histor|portrait/.test(value)) return 'historicalBusts';
  if (/vase|hohl/.test(value)) return 'hollow';
  if (/set|mehrteilig/.test(value)) return 'sets';
  if (/halter|lampe|dose|schale|ablage|funktion/.test(value))
    return 'functional';
  if (/geschenk/.test(value)) return 'gifts';
  if (/mini|klein|anhänger|anhaenger/.test(value)) return 'smallItems';
  return 'figures';
}

export function automaticEtsyPricingInput(
  product: ProductSnapshot,
  variant: ProductSnapshot['variants'][number],
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
): PhysicalPricingInput | null {
  if (
    !(typeof variant.productionCost === 'number' && variant.productionCost > 0)
  )
    return null;
  const value =
    `${product.name} ${product.productType} ${product.buyerWorld}`.toLocaleLowerCase(
      'de',
    );
  const functional = /halter|lampe|dose|schale|ablage|funktion|vase/.test(
    value,
  );
  const gift = /geschenk|personalis|hochzeit|liebe|tier/.test(value);
  const collector = /sammler|büste|bueste|histor|goth|limited/.test(value);
  const premium = /premium|ultra|sammler|detail|büste|bueste/.test(
    `${value} ${variant.name.toLocaleLowerCase('de')}`,
  );
  return {
    cogs: variant.productionCost,
    channel: 'etsy',
    category: inferPricingCategory(product),
    tier: /ultra/.test(variant.name.toLocaleLowerCase('de'))
      ? 'ultra'
      : premium
        ? 'premium'
        : 'standard',
    lengthCm:
      typeof product.dimensions.depth === 'number'
        ? product.dimensions.depth / 10
        : null,
    widthCm:
      typeof product.dimensions.width === 'number'
        ? product.dimensions.width / 10
        : null,
    heightCm:
      typeof product.dimensions.height === 'number'
        ? product.dimensions.height / 10
        : null,
    value: {
      complexity: collector ? 0.75 : 0.55,
      functionValue: functional ? 0.9 : 0.35,
      giftValue: gift ? 0.85 : 0.55,
      collectorValue: collector ? 0.85 : 0.35,
      personalization: /personalis/.test(value) ? 0.9 : 0,
      finish: premium ? 0.8 : 0.55,
    },
    demand: 'unknown',
    competition: 'unknown',
    config,
  };
}

export function calculateAutomaticEtsyPrice(
  product: ProductSnapshot,
  variant: ProductSnapshot['variants'][number],
  config: PricingConfig = DEFAULT_PRICING_CONFIG,
  previousInput?: PhysicalPricingInput | null,
): {
  input: PhysicalPricingInput;
  result: PriceRecommendation;
  view: CentralPriceView;
} | null {
  const inferred = automaticEtsyPricingInput(product, variant, config);
  const input = previousInput
    ? {
        ...previousInput,
        channel: 'etsy' as const,
        cogs:
          typeof variant.productionCost === 'number'
            ? variant.productionCost
            : previousInput.cogs,
      }
    : inferred;
  if (!input) return null;
  const result = calculatePhysicalRecommendation(input);
  const cents = (value: number | undefined) =>
    typeof value === 'number' ? Math.round(value * 100) : null;
  return {
    input,
    result,
    view: {
      variantId: variant.id,
      cogsCents: cents(input.cogs),
      activePriceCents: cents(variant.currentPrice ?? undefined),
      recommendedPriceCents: cents(result.recommendedPrice),
      floorPriceCents: cents(result.floorPrice),
      marketAnchorCents: cents(result.marketPrice),
      discountState: result.discountSafety?.fifteenPercent.state ?? null,
      status: 'CURRENT',
      confidence: result.confidence,
      reason:
        result.diagnostics.priceDriver === 'market'
          ? 'Marktanker bestimmt die Empfehlung'
          : 'Etsy-Floor sichert Kosten und Mindestbeitrag',
    },
  };
}
