// apps/app/config/integrations-auth0.ts

export type IntegrationTier = 'FREE' | 'PRO' | 'BUSINESS';

export interface Auth0Integration {
  key: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  requiredTier: IntegrationTier;
}

// ===== AUTH0 CLIENT IDS =====
export const AUTH0_CLIENT_IDS = {
  google: process.env.NEXT_PUBLIC_AUTH0_CONNECT_CLIENT_ID,
  spotify: process.env.NEXT_PUBLIC_AUTH0_CONNECT_CLIENT_ID,
  discord: process.env.NEXT_PUBLIC_AUTH0_CONNECT_CLIENT_ID,
  github: process.env.NEXT_PUBLIC_AUTH0_CONNECT_CLIENT_ID,
  linkedin: process.env.NEXT_PUBLIC_AUTH0_CONNECT_CLIENT_ID,
} as const;

// ===== OAUTH SCOPES =====
export const AUTH0_SCOPES = {
  google: "openid profile email offline_access https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/spreadsheets",
  spotify: "openid user-read-email user-read-private user-read-playback-state user-library-read offline_access",
  discord: "openid identify email guilds offline_access",
  github: "openid user:email repo read:user offline_access",
  linkedin: "openid r_liteprofile r_emailaddress w_member_social offline_access",
} as const;

// ===== INTEGRATION DEFINITIONS =====
export const AUTH0_INTEGRATIONS: Auth0Integration[] = [
  // ===== FREE TIER =====
  {
    key: 'google',
    name: 'Google',
    description: 'Drive, Gmail, Calendar & Sheets',
    icon: 'Globe',
    color: 'bg-blue-500',
    requiredTier: 'FREE',
  },
  {
    key: 'spotify',
    name: 'Spotify',
    description: 'Music streaming integration',
    icon: 'Music',
    color: 'bg-green-500',
    requiredTier: 'FREE',
  },
  
  // ===== PRO TIER =====
  {
    key: 'discord',
    name: 'Discord',
    description: 'Team communication',
    icon: 'MessageSquare',
    color: 'bg-indigo-500',
    requiredTier: 'PRO',
  },
  {
    key: 'github',
    name: 'GitHub',
    description: 'Version control & collaboration',
    icon: 'Github',
    color: 'bg-gray-700',
    requiredTier: 'PRO',
  },
  
  // ===== BUSINESS TIER =====
  {
    key: 'linkedin',
    name: 'LinkedIn',
    description: 'Professional networking',
    icon: 'Linkedin',
    color: 'bg-blue-600',
    requiredTier: 'BUSINESS',
  },
];

// ===== HELPER FUNCTIONS =====
export const getIntegrationsForTier = (tier: IntegrationTier): Auth0Integration[] => {
  const tierOrder: IntegrationTier[] = ['FREE', 'PRO', 'BUSINESS'];
  const tierIndex = tierOrder.indexOf(tier);
  
  return AUTH0_INTEGRATIONS.filter(integration => {
    const integrationTierIndex = tierOrder.indexOf(integration.requiredTier);
    return integrationTierIndex <= tierIndex;
  });
};

export const getLockedIntegrations = (tier: IntegrationTier): Auth0Integration[] => {
  const tierOrder: IntegrationTier[] = ['FREE', 'PRO', 'BUSINESS'];
  const tierIndex = tierOrder.indexOf(tier);
  
  return AUTH0_INTEGRATIONS.filter(integration => {
    const integrationTierIndex = tierOrder.indexOf(integration.requiredTier);
    return integrationTierIndex > tierIndex;
  });
};

// ===== OAUTH HELPER FUNCTIONS =====
export const createOAuthState = (userId: string, service: string): string => {
  return btoa(JSON.stringify({
    user_id: userId,
    service: service,
    timestamp: Date.now(),
  }));
};

export const buildAuthorizationUrl = (
  service: keyof typeof AUTH0_CLIENT_IDS,
  state: string
): string => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: AUTH0_CLIENT_IDS[service]!,
    redirect_uri: process.env.NEXT_PUBLIC_APP_URL + "/functions/v1/oauth-callback",
    scope: AUTH0_SCOPES[service],
    state: state,
    connection: service === 'google' ? 'google-oauth2' : service,
  });

  // For Google: request refresh token
  if (service === 'google') {
    params.append('access_type', 'offline');
    params.append('prompt', 'consent');
  }

  // For Spotify: show dialog
  if (service === 'spotify') {
    params.append('show_dialog', 'true');
  }

  return `https://${process.env.NEXT_PUBLIC_AUTH0_DOMAIN}/authorize?${params.toString()}`;
};