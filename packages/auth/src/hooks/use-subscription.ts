'use client';

import { useUser } from '@repo/auth/client';
import { type Feature, type SubscriptionTier, TIER_FEATURES, TIER_LIMITS } from '@repo/auth/lib/features';

// ============================================
// SUBSCRIPTION HOOK
// ============================================

export interface UseSubscriptionReturn {
  // Subscription info
  tier: SubscriptionTier;
  status: string | null;
  currentPeriodEnd: number | null;
  billingInterval: string | null;
  
  // Feature checks
  hasFeature: (feature: Feature) => boolean;
  hasFeatures: (features: Feature[]) => boolean;
  hasAnyFeature: (features: Feature[]) => boolean;
  
  // Tier checks (เก็บทั้งแบบเดิมและใหม่เพื่อ backward compatibility)
  isPro: boolean;
  isFree: boolean;
  isTier: (checkTier: SubscriptionTier) => boolean;
  isBusiness: boolean;
  
  // Usage limits
  limits: {
    apiCallsPerMonth: number;
    connectionsPerMonth: number;
    dataRetentionDays: number;
    maxWebhooks: number;
  };
  
  // Loading state
  isLoading: boolean;
}

/**
 * Client-side hook to check user's subscription and features
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { tier, hasFeature, isPro } = useSubscription();
 *   
 *   if (!hasFeature('export_data')) {
 *     return <UpgradePrompt />;
 *   }
 *   
 *   return <ExportButton />;
 * }
 * ```
 */
export function useSubscription(): UseSubscriptionReturn {
  const { user, isLoaded } = useUser();
  
  // Get subscription from Clerk metadata
  const metadata = user?.publicMetadata as {
    subscription?: {
      tier?: string;
      status?: string;
      currentPeriodEnd?: number;
      billingInterval?: string;
    };
  } | undefined;
  
  const subscription = metadata?.subscription;
  const tier = (subscription?.tier as SubscriptionTier) || 'FREE';
  const status = subscription?.status || null;
  const currentPeriodEnd = subscription?.currentPeriodEnd || null;
  const billingInterval = subscription?.billingInterval || null;
  
  // Get features for current tier
  const tierFeatures = TIER_FEATURES[tier];
  
  // Get limits for current tier
  const limits = TIER_LIMITS[tier];
  
  // Feature check functions
  const hasFeature = (feature: Feature): boolean => {
    return tierFeatures.includes(feature);
  };
  
  const hasFeatures = (features: Feature[]): boolean => {
    return features.every(feature => tierFeatures.includes(feature));
  };
  
  const hasAnyFeature = (features: Feature[]): boolean => {
    return features.some(feature => tierFeatures.includes(feature));
  };
  
  // Tier check function (ใหม่)
  const isTier = (checkTier: SubscriptionTier): boolean => {
    return tier === checkTier;
  };
  
  // Tier checks (เก็บแบบเดิมเป็น boolean properties)
  const isPro = tier === 'PRO' || tier === 'BUSINESS';
  const isFree = tier === 'FREE';
  const isBusiness = tier === 'BUSINESS';
  
  return {
    tier,
    status,
    currentPeriodEnd,
    billingInterval,
    hasFeature,
    hasFeatures,
    hasAnyFeature,
    isPro,
    isFree,
    isTier,
    isBusiness,
    limits,
    isLoading: !isLoaded,
  };
}

// ============================================
// USAGE TRACKING HOOK
// ============================================

export interface UseUsageReturn {
  // Current usage
  apiCalls: number;
  connections: number;
  
  // Limits
  apiCallsLimit: number;
  connectionsLimit: number;
  
  // Percentage
  apiCallsPercentage: number;
  connectionsPercentage: number;
  
  // Status
  hasReachedApiLimit: boolean;
  hasReachedConnectionLimit: boolean;
  canCreateConnection: boolean;
  
  // Loading
  isLoading: boolean;
}

/**
 * Hook to track user's usage against their limits
 * Note: This requires you to implement the API endpoint to fetch usage
 * 
 * @example
 * ```tsx
 * function UsageDisplay() {
 *   const { apiCalls, apiCallsLimit, apiCallsPercentage } = useUsage();
 *   
 *   return (
 *     <div>
 *       <p>API Calls: {apiCalls} / {apiCallsLimit}</p>
 *       <ProgressBar value={apiCallsPercentage} />
 *     </div>
 *   );
 * }
 * ```
 */
export function useUsage(): UseUsageReturn {
  const { limits, isLoading: subscriptionLoading } = useSubscription();
  
  // TODO: Fetch actual usage from API
  // For now, return mock data
  // You should implement: GET /api/usage
  
  const apiCalls = 0; // Replace with actual API call
  const connections = 0; // Replace with actual API call
  
  const apiCallsLimit = limits.apiCallsPerMonth === -1 
    ? Infinity 
    : limits.apiCallsPerMonth;
    
  const connectionsLimit = limits.connectionsPerMonth === -1 
    ? Infinity 
    : limits.connectionsPerMonth;
  
  const apiCallsPercentage = apiCallsLimit === Infinity 
    ? 0 
    : (apiCalls / apiCallsLimit) * 100;
    
  const connectionsPercentage = connectionsLimit === Infinity 
    ? 0 
    : (connections / connectionsLimit) * 100;
  
  const hasReachedApiLimit = apiCallsLimit !== Infinity && apiCalls >= apiCallsLimit;
  const hasReachedConnectionLimit = connectionsLimit !== Infinity && connections >= connectionsLimit;
  const canCreateConnection = !hasReachedConnectionLimit;
  
  return {
    apiCalls,
    connections,
    apiCallsLimit,
    connectionsLimit,
    apiCallsPercentage,
    connectionsPercentage,
    hasReachedApiLimit,
    hasReachedConnectionLimit,
    canCreateConnection,
    isLoading: subscriptionLoading,
  };
}