/**
 * Feature definitions for subscription tiers
 * Plans: FREE, PRO, BUSINESS (with monthly/yearly options)
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
  
  // Business Features
  | 'custom_branding'
  | 'sso_integration'
  | 'dedicated_support'
  | 'custom_integrations'
  | 'white_label'
  | 'api_access'
  | 'advanced_security';

export type SubscriptionTier = 'FREE' | 'PRO' | 'BUSINESS';
export type BillingInterval = 'monthly' | 'yearly';

// ============================================
// FEATURE MAPPING
// ============================================

export const TIER_FEATURES: Record<SubscriptionTier, Feature[]> = {
  FREE: [
    'basic_dashboard',
    'basic_connection',
  ],
  
  PRO: [
    'basic_dashboard',
    'basic_connection',
    'full_service_connection',
    'advanced_dashboard',
    'unlimited_api_calls',
    'export_data',
    'priority_support',
    'advanced_analytics',
    'webhook_integration',
  ],
  
  BUSINESS: [
    // All PRO features
    'basic_dashboard',
    'basic_connection',
    'full_service_connection',
    'advanced_dashboard',
    'unlimited_api_calls',
    'export_data',
    'priority_support',
    'advanced_analytics',
    'webhook_integration',
    
    // Plus BUSINESS features
    'custom_branding',
    'sso_integration',
    'dedicated_support',
    'custom_integrations',
    'white_label',
    'api_access',
    'advanced_security',
  ],
};

// ============================================
// USAGE LIMITS
// ============================================

export const TIER_LIMITS = {
  FREE: {
    apiCallsPerMonth: 100,
    connectionsPerMonth: 1,
    dataRetentionDays: 30,
    maxWebhooks: 0,
    maxTeamMembers: 1,
  },
  
  PRO: {
    apiCallsPerMonth: -1, // unlimited
    connectionsPerMonth: -1,
    dataRetentionDays: 365,
    maxWebhooks: 10,
    maxTeamMembers: 5,
  },
  
  BUSINESS: {
    apiCallsPerMonth: -1,
    connectionsPerMonth: -1,
    dataRetentionDays: -1, // unlimited
    maxWebhooks: -1,
    maxTeamMembers: -1, // unlimited
  },
} as const;

// ============================================
// FEATURE DESCRIPTIONS
// ============================================

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
  sso_integration: 'Single Sign-On (SSO)',
  dedicated_support: 'Dedicated account manager',
  custom_integrations: 'Custom integrations',
  white_label: 'Full white-label solution',
  api_access: 'Full API access',
  advanced_security: 'Advanced security features',
};

// ============================================
// STRIPE PRICE IDS
// ============================================

export const TIER_PRICE_IDS = {
  FREE: null,
  
  PRO: {
    monthly: 'price_1Ric5JDLk0PkB2fKhSmA0GoO',
    yearly: 'price_1SHbUfDLk0PkB2fKliMAf7R4', // Replace with your Stripe price ID
  },
  
  BUSINESS: {
    monthly: 'price_1SHbwMDLk0PkB2fKP0kXrabL', // Replace with your Stripe price ID
    yearly: 'price_1SHbxXDLk0PkB2fKCJYkEJCC', // Replace with your Stripe price ID
  },
} as const;

// ============================================
// PRICING INFORMATION
// ============================================

export const TIER_PRICING = {
  FREE: {
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: 'For individuals or teams looking to organize anything.',
    features: TIER_FEATURES.FREE,
    priceIds: null,
    popular: false,
  },
  
  PRO: {
    name: 'Standard',
    monthlyPrice: 6,
    yearlyPrice: 60, // $5/month billed yearly
    description: 'For teams that need to manage more work.',
    features: TIER_FEATURES.PRO,
    priceIds: TIER_PRICE_IDS.PRO,
    popular: true,
  },
  
  BUSINESS: {
    name: 'Premium',
    monthlyPrice: 12,
    yearlyPrice: 120, // $10/month billed yearly
    description: 'Best for teams that need to track multiple projects.',
    features: TIER_FEATURES.BUSINESS,
    priceIds: TIER_PRICE_IDS.BUSINESS,
    popular: false,
  },
} as const;

// ============================================
// HELPER FUNCTIONS
// ============================================

export function tierHasFeature(tier: SubscriptionTier, feature: Feature): boolean {
  return TIER_FEATURES[tier].includes(feature);
}

export function getTierFeatures(tier: SubscriptionTier): Feature[] {
  return TIER_FEATURES[tier];
}

export function getTierLimits(tier: SubscriptionTier) {
  return TIER_LIMITS[tier];
}

export function getTierPriceId(tier: SubscriptionTier, interval: BillingInterval): string | null {
  if (tier === 'FREE') return null;
  return TIER_PRICE_IDS[tier][interval];
}

export function getTierFromPriceId(priceId: string): SubscriptionTier {
  // PRO
  if (priceId === TIER_PRICE_IDS.PRO.monthly || priceId === TIER_PRICE_IDS.PRO.yearly) {
    return 'PRO';
  }
  
  // BUSINESS
  if (priceId === TIER_PRICE_IDS.BUSINESS.monthly || priceId === TIER_PRICE_IDS.BUSINESS.yearly) {
    return 'BUSINESS';
  }
  
  return 'FREE';
}

export function getBillingIntervalFromPriceId(priceId: string): BillingInterval {
  // Check PRO
  if (priceId === TIER_PRICE_IDS.PRO.yearly || priceId === TIER_PRICE_IDS.BUSINESS.yearly) {
    return 'yearly';
  }
  
  return 'monthly';
}