export type SalesChannel = 'etsy' | 'direct' | 'vinted' | 'ebay' | 'market';
export type MarketPsychology = 'price_sensitive' | 'balanced' | 'premium_seeking';

export type MarketCategory =
  | 'gothic'
  | 'figures'
  | 'historicalBusts'
  | 'gifts'
  | 'functional'
  | 'hollow'
  | 'sets'
  | 'smallItems'
  | 'digital';

export type MarketQuantiles = {
  p25: number;
  median: number;
  p75: number;
  p90: number;
};

export type ChannelPricingConfig = {
  percentageFees: number;
  fixedFees: number;
  feeVatRate: number;
  discountReserve: number;
  nonCogsCosts: number;
  roundingStrategy: 'etsy-physical' | 'direct' | 'vinted' | 'ebay' | 'market';
};

export interface PricingConfig {
  version: string;
  physical: {
    minimumAbsoluteContribution: number;
    minimumCogsContributionRate: number;
    defaultDiscountReserve: number;
    normal: {
      minimumAbsoluteContribution: number;
      minimumCogsContributionRate: number;
    };
    micro: {
      minimumAbsoluteContribution: number;
      minimumCogsContributionRate: number;
    };
  };
  bundles: {
    degressions: Record<3 | 5 | 10, number>;
  };
  etsy: {
    transactionRate: number;
    paymentRate: number;
    paymentFixed: number;
    listingFeeEUR: number;
    offsiteRates: number[];
    feeVatRate: number;
  };
  channels: Record<SalesChannel, ChannelPricingConfig>;
  marketPsychology: Record<MarketPsychology, { quantileShift: number }>;
  market: {
    smallItemThreshold: number;
    smallItemStep: number;
    normalStep: number;
  };
  digital: {
    priceLadder: number[];
    leadProductPrice: number;
  };
  presence: {
    longestDimensionWeight: number;
    volumeWeight: number;
    minFactor: number;
    maxFactor: number;
    referenceLongestCm: Record<Exclude<MarketCategory, 'digital'>, number>;
  };
  impact: {
    solid: number;
    detailed: number;
    premiumImpact: number;
  };
  demandPerformance: {
    high: number;
    normal: number;
    low: number;
    minimumReliableSales: number;
    minimumReliableViews: number;
    highConversionRate: number;
    lowConversionRate: number;
    highFavoriteVelocity: number;
    lowFavoriteVelocity: number;
  };
  defect: {
    weights: {
      aesthetic: number;
      functional: number;
      structural: number;
      nonRepairable: number;
      giftCollectorLoss: number;
    };
    exponent: number;
  };
  marketQuantiles: Record<MarketCategory, MarketQuantiles>;
  valueWeights: {
    complexity: number;
    functionValue: number;
    giftValue: number;
    collectorValue: number;
    personalization: number;
    finish: number;
    maxFactor: number;
  };
  demandCompetition: {
    highDemandHighCompetition: number;
    highDemandLowCompetition: number;
    lowDemandHighCompetition: number;
    lowDemandLowCompetition: number;
    unknown: number;
  };
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  version: '2026-09-14.2',
  physical: {
    minimumAbsoluteContribution: 5,
    minimumCogsContributionRate: 0.4,
    defaultDiscountReserve: 0.15,
    normal: {
      minimumAbsoluteContribution: 5,
      minimumCogsContributionRate: 0.4,
    },
    micro: {
      minimumAbsoluteContribution: 1.5,
      minimumCogsContributionRate: 0.4,
    },
  },
  bundles: {
    degressions: { 3: 0.75, 5: 0.65, 10: 0.55 },
  },
  etsy: {
    transactionRate: 0.065,
    paymentRate: 0.04,
    paymentFixed: 0.3,
    listingFeeEUR: 0.18,
    offsiteRates: [0, 0.12, 0.15],
    feeVatRate: 0.19,
  },
  channels: {
    etsy: {
      percentageFees: 0.105,
      fixedFees: 0.48,
      feeVatRate: 0.19,
      discountReserve: 0.15,
      nonCogsCosts: 0,
      roundingStrategy: 'etsy-physical',
    },
    direct: {
      percentageFees: 0,
      fixedFees: 0,
      feeVatRate: 0,
      discountReserve: 0,
      nonCogsCosts: 0,
      roundingStrategy: 'direct',
    },
    vinted: {
      percentageFees: 0,
      fixedFees: 0,
      feeVatRate: 0,
      discountReserve: 0,
      nonCogsCosts: 0,
      roundingStrategy: 'vinted',
    },
    ebay: {
      percentageFees: 0,
      fixedFees: 0,
      feeVatRate: 0,
      discountReserve: 0,
      nonCogsCosts: 0,
      roundingStrategy: 'ebay',
    },
    market: {
      percentageFees: 0,
      fixedFees: 0,
      feeVatRate: 0,
      discountReserve: 0,
      nonCogsCosts: 0,
      roundingStrategy: 'market',
    },
  },
  marketPsychology: {
    price_sensitive: { quantileShift: -0.1 },
    balanced: { quantileShift: 0 },
    premium_seeking: { quantileShift: 0.1 },
  },
  market: {
    smallItemThreshold: 5,
    smallItemStep: 0.5,
    normalStep: 5,
  },
  digital: {
    priceLadder: [
      2.9, 3.9, 4.9, 5.9, 6.9, 7.9, 9.9, 12.9, 14.9, 19.9, 24.9,
    ],
    leadProductPrice: 1.9,
  },
  presence: {
    longestDimensionWeight: 0.65,
    volumeWeight: 0.35,
    minFactor: 0.55,
    maxFactor: 2.5,
    referenceLongestCm: {
      smallItems: 6,
      figures: 15,
      historicalBusts: 18,
      gothic: 18,
      gifts: 15,
      functional: 18,
      hollow: 25,
      sets: 12,
    },
  },
  impact: {
    solid: 0.75,
    detailed: 1,
    premiumImpact: 1.35,
  },
  demandPerformance: {
    high: 1.2,
    normal: 1,
    low: 0.85,
    minimumReliableSales: 5,
    minimumReliableViews: 100,
    highConversionRate: 0.04,
    lowConversionRate: 0.005,
    highFavoriteVelocity: 0.2,
    lowFavoriteVelocity: 0.02,
  },
  defect: {
    weights: {
      aesthetic: 0.35,
      functional: 0.25,
      structural: 0.15,
      nonRepairable: 0.1,
      giftCollectorLoss: 0.15,
    },
    exponent: 1.2,
  },
  marketQuantiles: {
    gothic: { p25: 16.14, median: 21.19, p75: 26.41, p90: 31.13 },
    figures: { p25: 14.99, median: 32.22, p75: 55, p90: 101.15 },
    historicalBusts: { p25: 17.09, median: 25.19, p75: 33.24, p90: 41 },
    gifts: { p25: 20, median: 23.4, p75: 32.41, p90: 41.22 },
    functional: { p25: 13.28, median: 18.5, p75: 26.09, p90: 29.89 },
    hollow: { p25: 14.95, median: 22.9, p75: 39, p90: 56.4 },
    sets: { p25: 12.8, median: 16.95, p75: 22.72, p90: 30.06 },
    smallItems: { p25: 3.44, median: 3.95, p75: 5.97, p90: 6.49 },
    digital: { p25: 3.44, median: 3.74, p75: 5.95, p90: 10.3 },
  },
  valueWeights: {
    complexity: 0.1,
    functionValue: 0.1,
    giftValue: 0.08,
    collectorValue: 0.12,
    personalization: 0.08,
    finish: 0.06,
    maxFactor: 1.35,
  },
  demandCompetition: {
    highDemandHighCompetition: 1,
    highDemandLowCompetition: 1.08,
    lowDemandHighCompetition: 0.92,
    lowDemandLowCompetition: 1,
    unknown: 1,
  },
};
