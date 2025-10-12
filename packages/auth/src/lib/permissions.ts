import 'server-only';
import { auth, currentUser } from '@clerk/nextjs/server';
import { type Feature, type SubscriptionTier, TIER_FEATURES, TIER_LIMITS, getTierFromPriceId } from './features';

// ============================================
// GET USER SUBSCRIPTION
// ============================================

/**
 * Get current user's subscription tier from Clerk metadata
 */
export async function getUserTier(): Promise<SubscriptionTier> {
  try {
    const user = await currentUser();
    
    if (!user) {
      return 'FREE';
    }

    // Try to get tier from publicMetadata (set by webhook)
    const metadata = user.publicMetadata as {
      subscription?: {
        tier?: string;
        status?: string;
      };
    };

    const tier = metadata?.subscription?.tier as SubscriptionTier | undefined;
    
    // Validate tier
    if (tier === 'PRO' || tier === 'FREE') {
      return tier;
    }

    return 'FREE';
  } catch (error) {
    console.error('Error getting user tier:', error);
    return 'FREE';
  }
}

/**
 * Get current user's subscription status
 */
export async function getSubscriptionStatus(): Promise<{
  tier: SubscriptionTier;
  status: string | null;
  currentPeriodEnd: number | null;
}> {
  try {
    const user = await currentUser();
    
    if (!user) {
      return {
        tier: 'FREE',
        status: null,
        currentPeriodEnd: null,
      };
    }

    const metadata = user.publicMetadata as {
      subscription?: {
        tier?: string;
        status?: string;
        currentPeriodEnd?: number;
      };
    };

    const subscription = metadata?.subscription;

    return {
      tier: (subscription?.tier as SubscriptionTier) || 'FREE',
      status: subscription?.status || null,
      currentPeriodEnd: subscription?.currentPeriodEnd || null,
    };
  } catch (error) {
    console.error('Error getting subscription status:', error);
    return {
      tier: 'FREE',
      status: null,
      currentPeriodEnd: null,
    };
  }
}

// ============================================
// FEATURE CHECKS
// ============================================

/**
 * Check if current user has access to a feature
 */
export async function hasFeature(feature: Feature): Promise<boolean> {
  try {
    const tier = await getUserTier();
    return TIER_FEATURES[tier].includes(feature);
  } catch (error) {
    console.error('Error checking feature access:', error);
    return false;
  }
}

/**
 * Check if current user has access to multiple features
 */
export async function hasFeatures(features: Feature[]): Promise<boolean> {
  try {
    const tier = await getUserTier();
    const tierFeatures = TIER_FEATURES[tier];
    return features.every(feature => tierFeatures.includes(feature));
  } catch (error) {
    console.error('Error checking features access:', error);
    return false;
  }
}

/**
 * Check if current user has ANY of the specified features
 */
export async function hasAnyFeature(features: Feature[]): Promise<boolean> {
  try {
    const tier = await getUserTier();
    const tierFeatures = TIER_FEATURES[tier];
    return features.some(feature => tierFeatures.includes(feature));
  } catch (error) {
    console.error('Error checking any feature access:', error);
    return false;
  }
}

// ============================================
// REQUIRE FEATURE (Throw if not available)
// ============================================

/**
 * Require a feature - throws error if user doesn't have access
 * Use this in API routes or server actions
 */
export async function requireFeature(feature: Feature): Promise<void> {
  const hasAccess = await hasFeature(feature);
  
  if (!hasAccess) {
    const tier = await getUserTier();
    throw new Error(
      `Feature "${feature}" requires upgrade. Current tier: ${tier}`
    );
  }
}

/**
 * Require specific tier - throws error if user doesn't have it
 */
export async function requireTier(requiredTier: SubscriptionTier): Promise<void> {
  const currentTier = await getUserTier();
  
  // Simple comparison (assumes PRO > FREE)
  const tierOrder: Record<SubscriptionTier, number> = {
    FREE: 0,
    PRO: 1,
  };
  
  if (tierOrder[currentTier] < tierOrder[requiredTier]) {
    throw new Error(
      `This action requires ${requiredTier} tier. Current tier: ${currentTier}`
    );
  }
}

// ============================================
// USAGE LIMITS
// ============================================

/**
 * Get usage limits for current user
 */
export async function getUserLimits() {
  const tier = await getUserTier();
  return TIER_LIMITS[tier];
}

/**
 * Check if user has reached API call limit
 */
export async function hasReachedApiLimit(currentUsage: number): Promise<boolean> {
  const limits = await getUserLimits();
  
  // -1 means unlimited
  if (limits.apiCallsPerMonth === -1) {
    return false;
  }
  
  return currentUsage >= limits.apiCallsPerMonth;
}

/**
 * Check if user can create more connections
 */
export async function canCreateConnection(currentConnections: number): Promise<boolean> {
  const limits = await getUserLimits();
  
  // -1 means unlimited
  if (limits.connectionsPerMonth === -1) {
    return true;
  }
  
  return currentConnections < limits.connectionsPerMonth;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Check if user is on PRO tier
 */
export async function isPro(): Promise<boolean> {
  const tier = await getUserTier();
  return tier === 'PRO';
}

/**
 * Check if user is on FREE tier
 */
export async function isFree(): Promise<boolean> {
  const tier = await getUserTier();
  return tier === 'FREE';
}

/**
 * Get user info with subscription
 */
export async function getUserWithSubscription() {
  const user = await currentUser();
  const subscription = await getSubscriptionStatus();
  const limits = await getUserLimits();
  
  return {
    user,
    subscription,
    limits,
  };
}