/**
 * Feature definitions for subscription tiers
 * Based on your plans: FREE and PRO
 */

// ============================================
// FEATURE TYPES
// ============================================

export type Feature =
  // Basic Features (FREE tier)
  | 'basic_dashboard'
  | 'basic_connection'
  
  // Pro Features
  | 'full_service_connection'
  | 'advanced_dashboard'
  | 'unlimited_api_calls'
  | 'export_data'
  | 'priority_support'
  | 'advanced_analytics'
  | 'webhook_integration'
  | 'custom_branding';

export type SubscriptionTier = 'FREE' | 'PRO';

// ============================================
// FEATURE MAPPING
// ============================================

/**
 * Define which features are available for each tier
 */
export const TIER_FEATURES: Record<SubscriptionTier, Feature[]> = {
  FREE: [
    'basic_dashboard',
    'basic_connection',
  ],
  
  PRO: [
    // All FREE features
    'basic_dashboard',
    'basic_connection',
    
    // Additional PRO features
    'full_service_connection',
    'advanced_dashboard',
    'unlimited_api_calls',
    'export_data',
    'priority_support',
    'advanced_analytics',
    'webhook_integration',
    'custom_branding',
  ],
};

// ============================================
// USAGE LIMITS
// ============================================

/**
 * Define usage limits for each tier
 */
export const TIER_LIMITS = {
  FREE: {
    apiCallsPerMonth: 100,
    connectionsPerMonth: 1,
    dataRetentionDays: 30,
    maxWebhooks: 0,
  },
  
  PRO: {
    apiCallsPerMonth: -1, // unlimited
    connectionsPerMonth: -1, // unlimited
    dataRetentionDays: 365,
    maxWebhooks: 10,
  },
} as const;

// ============================================
// FEATURE METADATA
// ============================================

/**
 * Human-readable feature descriptions
 */
export const FEATURE_DESCRIPTIONS: Record<Feature, string> = {
  basic_dashboard: 'Access to basic dashboard',
  basic_connection: 'Basic service connection',
  full_service_connection: 'Full service connection with all features',
  advanced_dashboard: 'Advanced analytics dashboard',
  unlimited_api_calls: 'Unlimited API calls',
  export_data: 'Export data to CSV/JSON',
  priority_support: 'Priority customer support',
  advanced_analytics: 'Advanced analytics and insights',
  webhook_integration: 'Webhook integrations',
  custom_branding: 'Custom branding and white-label',
};

// ============================================
// PRICING
// ============================================

/**
 * Stripe Price IDs for each tier
 */
export const TIER_PRICE_IDS: Record<SubscriptionTier, string | null> = {
  FREE: null,
  PRO: 'price_1Ric5JDLk0PkB2fKhSmA0GoO',
};

/**
 * Pricing information for display
 */
export const TIER_PRICING = {
  FREE: {
    name: 'Free',
    price: 0,
    interval: 'month' as const,
    description: 'Basic service connection',
    priceId: null,
  },
  
  PRO: {
    name: 'Pro',
    price: 29,
    interval: 'month' as const,
    description: 'Full service connection',
    priceId: 'price_1Ric5JDLk0PkB2fKhSmA0GoO',
  },
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if a tier has a specific feature
 */
export function tierHasFeature(tier: SubscriptionTier, feature: Feature): boolean {
  return TIER_FEATURES[tier].includes(feature);
}

/**
 * Get all features for a tier
 */
export function getTierFeatures(tier: SubscriptionTier): Feature[] {
  return TIER_FEATURES[tier];
}

/**
 * Get usage limits for a tier
 */
export function getTierLimits(tier: SubscriptionTier) {
  return TIER_LIMITS[tier];
}

/**
 * Get price ID for a tier
 */
export function getTierPriceId(tier: SubscriptionTier): string | null {
  return TIER_PRICE_IDS[tier];
}

/**
 * Get tier from price ID
 */
export function getTierFromPriceId(priceId: string): SubscriptionTier {
  if (priceId === TIER_PRICE_IDS.PRO) {
    return 'PRO';
  }
  return 'FREE';
}