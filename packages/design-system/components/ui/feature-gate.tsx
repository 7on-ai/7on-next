'use client';

import type { Feature } from '@repo/auth';
import type { ReactNode } from 'react';

interface FeatureGateProps {
  feature: Feature;
  hasFeature: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Feature Gate Component
 * Shows/hides content based on user's subscription tier
 * 
 * @example
 * ```tsx
 * <FeatureGate 
 *   feature="advanced_analytics" 
 *   hasFeature={hasFeature('advanced_analytics')}
 *   fallback={<UpgradePrompt />}
 * >
 *   <AdvancedAnalytics />
 * </FeatureGate>
 * ```
 */
export function FeatureGate({
  feature,
  hasFeature,
  fallback = null,
  children,
}: FeatureGateProps) {
  if (!hasFeature) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}