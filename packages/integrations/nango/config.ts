import type { SubscriptionTier } from '@repo/auth/client';

/**
 * Nango Integration Configuration
 * Define which integrations are available for each tier
 */

// ============================================
// INTEGRATION DEFINITIONS
// ============================================

export type IntegrationKey =
  | 'google-calendar'
  | 'google-drive'
  | 'spotify'
  | 'facebook'
  | 'slack'
  | 'airtable'
  | 'notion';

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
  'google-calendar': {
    key: 'google-calendar',
    name: 'Google Calendar',
    description: 'Connect your Google Calendar',
    icon: 'Calendar',
    color: 'bg-blue-500',
    scopes: ['email', 'profile', 'openid'],
    category: 'productivity',
    requiredTier: 'FREE',
  },
  
  'google-drive': {
    key: 'google-drive',
    name: 'Google Drive',
    description: 'Access your Google Drive files and folders',
    icon: 'HardDrive',
    color: 'bg-green-500',
    scopes: ['email', 'profile', 'openid'],
    category: 'productivity',
    requiredTier: 'FREE',
  },
  
  'spotify': {
    key: 'spotify',
    name: 'Spotify',
    description: 'Access your Spotify playlists and music library',
    icon: 'Music',
    color: 'bg-green-500',
    scopes: ['user-read-email', 'user-read-private'],
    category: 'social',
    requiredTier: 'FREE',
  },
  
  'facebook': {
    key: 'facebook',
    name: 'Facebook',
    description: 'Connect to Facebook pages and posts',
    icon: 'Facebook',
    color: 'bg-blue-600',
    scopes: ['email', 'public_profile'],
    category: 'social',
    requiredTier: 'FREE',
  },
  
  'slack': {
    key: 'slack',
    name: 'Slack',
    description: 'Send messages and manage Slack workspaces',
    icon: 'MessageSquare',
    color: 'bg-purple-500',
    scopes: ['chat:write', 'channels:read'],
    category: 'communication',
    requiredTier: 'PRO',
  },
  
  'airtable': {
    key: 'airtable',
    name: 'Airtable',
    description: 'Sync data with Airtable bases',
    icon: 'Table',
    color: 'bg-orange-500',
    scopes: ['data.records:read', 'data.records:write'],
    category: 'data',
    requiredTier: 'PRO',
  },
  
  'notion': {
    key: 'notion',
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
  FREE: ['google-calendar', 'google-drive', 'spotify', 'facebook'],
  
  PRO: [
    'google-calendar',
    'google-drive',
    'spotify',
    'facebook',
    'slack',
    'airtable',
  ],
  
  BUSINESS: [
    'google-calendar',
    'google-drive',
    'spotify',
    'facebook',
    'slack',
    'airtable',
    'notion',
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