import 'server-only';

export * from '@clerk/nextjs/server';

// Re-export subscription features (server-side only)
export {
  getUserTier,
  getSubscriptionStatus,
  hasFeature,
  hasFeatures,
  hasAnyFeature,
  requireFeature,
  requireTier,
  getUserLimits,
  hasReachedApiLimit,
  canCreateConnection,
  isPro,
  isFree,
  getUserWithSubscription,
} from './src/lib/permissions';

export {
  type Feature,
  type SubscriptionTier,
  TIER_FEATURES,
  TIER_LIMITS,
  TIER_PRICE_IDS,
  TIER_PRICING,
  FEATURE_DESCRIPTIONS,
  tierHasFeature,
  getTierFeatures,
  getTierLimits,
  getTierPriceId,
  getTierFromPriceId,
} from './src/lib/features';