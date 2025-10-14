import type { SubscriptionTier } from '@repo/auth/client';

/**
 * Nango Integration Configuration
 * Define which integrations are available for each tier
 */

// ============================================
// INTEGRATION DEFINITIONS
// ============================================

export type IntegrationKey =
  | 'google-oauth'
  | 'spotify-oauth'
  | 'facebook-oauth'
  | 'slack-oauth'
  | 'airtable-oauth'
  | 'notion-oauth';

export interface IntegrationConfig {
  key: IntegrationKey;
  name: string;
  description: string;
  icon: string; // Lucide icon name
  color: string; // Tailwind color class
  scopes: string[]; // OAuth scopes
  category: 'social' | 'productivity' | 'data' | 'communication';
  requiredTier: SubscriptionTier;
}

// ============================================
// INTEGRATION CATALOG
// ============================================

export const INTEGRATIONS: Record<IntegrationKey, IntegrationConfig> = {
  'google-oauth': {
    key: 'google-oauth',
    name: 'Google',
    description: 'Connect your Google account for Gmail, Drive, Calendar',
    icon: 'Mail',
    color: 'bg-red-500',
    scopes: ['email', 'profile', 'openid'],
    category: 'productivity',
    requiredTier: 'FREE',
  },
  
  'spotify-oauth': {
    key: 'spotify-oauth',
    name: 'Spotify',
    description: 'Access your Spotify playlists and music library',
    icon: 'Music',
    color: 'bg-green-500',
    scopes: ['user-read-email', 'user-read-private'],
    category: 'social',
    requiredTier: 'FREE',
  },
  
  'facebook-oauth': {
    key: 'facebook-oauth',
    name: 'Facebook',
    description: 'Connect to Facebook pages and posts',
    icon: 'Facebook',
    color: 'bg-blue-600',
    scopes: ['email', 'public_profile'],
    category: 'social',
    requiredTier: 'FREE',
  },
  
  'slack-oauth': {
    key: 'slack-oauth',
    name: 'Slack',
    description: 'Send messages and manage Slack workspaces',
    icon: 'MessageSquare',
    color: 'bg-purple-500',
    scopes: ['chat:write', 'channels:read'],
    category: 'communication',
    requiredTier: 'PRO',
  },
  
  'airtable-oauth': {
    key: 'airtable-oauth',
    name: 'Airtable',
    description: 'Sync data with Airtable bases',
    icon: 'Table',
    color: 'bg-orange-500',
    scopes: ['data.records:read', 'data.records:write'],
    category: 'data',
    requiredTier: 'PRO',
  },
  
  'notion-oauth': {
    key: 'notion-oauth',
    name: 'Notion',
    description: 'Connect to Notion pages and databases',
    icon: 'FileText',
    color: 'bg-black',
    scopes: ['read_content', 'update_content'],
    category: 'productivity',
    requiredTier: 'BUSINESS',
  },
};

// ============================================
// TIER-BASED ACCESS
// ============================================

export const TIER_INTEGRATIONS: Record<SubscriptionTier, IntegrationKey[]> = {
  FREE: ['google-oauth', 'spotify-oauth', 'facebook-oauth'],
  
  PRO: [
    'google-oauth',
    'spotify-oauth',
    'facebook-oauth',
    'slack-oauth',
    'airtable-oauth',
  ],
  
  BUSINESS: [
    'google-oauth',
    'spotify-oauth',
    'facebook-oauth',
    'slack-oauth',
    'airtable-oauth',
    'notion-oauth',
  ],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get integrations available for a tier
 */
export function getIntegrationsForTier(tier: SubscriptionTier): IntegrationConfig[] {
  const keys = TIER_INTEGRATIONS[tier];
  return keys.map((key) => INTEGRATIONS[key]);
}

/**
 * Get locked integrations (not available for tier)
 */
export function getLockedIntegrations(tier: SubscriptionTier): IntegrationConfig[] {
  const availableKeys = TIER_INTEGRATIONS[tier];
  const allKeys = Object.keys(INTEGRATIONS) as IntegrationKey[];
  
  return allKeys
    .filter((key) => !availableKeys.includes(key))
    .map((key) => INTEGRATIONS[key]);
}

/**
 * Check if integration is available for tier
 */
export function isIntegrationAvailable(
  integrationKey: IntegrationKey,
  tier: SubscriptionTier
): boolean {
  return TIER_INTEGRATIONS[tier].includes(integrationKey);
}

/**
 * Get integration by key
 */
export function getIntegration(key: IntegrationKey): IntegrationConfig | undefined {
  return INTEGRATIONS[key];
}

/**
 * Get all integrations grouped by category
 */
export function getIntegrationsByCategory() {
  const grouped: Record<string, IntegrationConfig[]> = {};
  
  Object.values(INTEGRATIONS).forEach((integration) => {
    if (!grouped[integration.category]) {
      grouped[integration.category] = [];
    }
    grouped[integration.category].push(integration);
  });
  
  return grouped;
}