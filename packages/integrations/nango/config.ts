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
    // ✅ Correct scopes for Google Calendar
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    category: 'productivity',
    requiredTier: 'FREE',
  },
  
  'google-drive': {
    key: 'google-drive',
    name: 'Google Drive',
    description: 'Access your Google Drive',
    icon: 'HardDrive',
    color: 'bg-green-500',
    // ✅ Correct scopes for Google Drive
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    category: 'productivity',
    requiredTier: 'FREE',
  },
  
  'spotify': {
    key: 'spotify',
    name: 'Spotify',
    description: 'Access your Spotify playlists',
    icon: 'Music',
    color: 'bg-green-500',
    // ✅ Correct scopes for Spotify
    scopes: [
      'user-read-email',
      'user-read-private',
      'playlist-read-private',
      'playlist-read-collaborative',
    ],
    category: 'social',
    requiredTier: 'FREE',
  },
  
  'facebook': {
    key: 'facebook',
    name: 'Facebook',
    description: 'Connect to Facebook pages and posts',
    icon: 'Facebook',
    color: 'bg-blue-600',
    // ✅ Correct scopes for Facebook
    scopes: [
      'email',
      'public_profile',
    ],
    category: 'social',
    requiredTier: 'FREE',
  },
  
  'slack': {
    key: 'slack',
    name: 'Slack',
    description: 'Send messages and manage Slack workspaces',
    icon: 'MessageSquare',
    color: 'bg-purple-500',
    // ✅ Correct scopes for Slack
    scopes: [
      'chat:write',
      'channels:read',
      'users:read',
    ],
    category: 'communication',
    requiredTier: 'PRO',
  },
  
  'airtable': {
    key: 'airtable',
    name: 'Airtable',
    description: 'Sync data with Airtable bases',
    icon: 'Table',
    color: 'bg-orange-500',
    // ✅ Correct scopes for Airtable
    scopes: [
      'data.records:read',
      'data.records:write',
      'schema.bases:read',
    ],
    category: 'data',
    requiredTier: 'PRO',
  },
  
  'notion': {
    key: 'notion',
    name: 'Notion',
    description: 'Connect to Notion pages and databases',
    icon: 'FileText',
    color: 'bg-black',
    // ✅ Correct scopes for Notion
    scopes: [
      'read_content',
      'update_content',
      'insert_content',
    ],
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

export function getIntegrationsForTier(tier: SubscriptionTier): IntegrationConfig[] {
  const keys = TIER_INTEGRATIONS[tier];
  return keys.map((key) => INTEGRATIONS[key]);
}

export function getLockedIntegrations(tier: SubscriptionTier): IntegrationConfig[] {
  const availableKeys = TIER_INTEGRATIONS[tier];
  const allKeys = Object.keys(INTEGRATIONS) as IntegrationKey[];
  
  return allKeys
    .filter((key) => !availableKeys.includes(key))
    .map((key) => INTEGRATIONS[key]);
}

export function isIntegrationAvailable(
  integrationKey: IntegrationKey,
  tier: SubscriptionTier
): boolean {
  return TIER_INTEGRATIONS[tier].includes(integrationKey);
}

export function getIntegration(key: IntegrationKey): IntegrationConfig | undefined {
  return INTEGRATIONS[key];
}

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