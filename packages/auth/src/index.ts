// Export everything from existing files
export * from './client';
export * from './server';
export * from './keys';
export * from './provider';

// Export new subscription features
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
} from './lib/features';

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
} from './lib/permissions';

export {
  useSubscription,
  useUsage,
  type UseSubscriptionReturn,
  type UseUsageReturn,
} from './hooks/use-subscription';