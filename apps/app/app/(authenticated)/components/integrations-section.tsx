'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/design-system/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/design-system/components/ui/tabs';
import { useSubscription } from '@repo/auth/hooks/use-subscription';
import { Button } from '@repo/design-system/components/ui/button';
import { ProBadge } from '@repo/design-system/components/ui/pro-badge';
import { LockIcon, PlugIcon, Loader2Icon, type LucideIcon } from 'lucide-react';
import * as Icons from 'lucide-react';
import { useUser } from '@repo/auth/client';
import {
  AUTH0_INTEGRATIONS,
  getIntegrationsForTier,
  getLockedIntegrations,
  createOAuthState,
  buildAuthorizationUrl,
  type Auth0Integration,
} from '@/config/integrations-auth0';

// ===== CUSTOM ICON COMPONENTS =====
const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const SpotifyIcon = () => (
  <svg className="h-5 w-5" fill="#1DB954" viewBox="0 0 24 24">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const DiscordIcon = () => (
  <svg className="h-5 w-5" fill="#5865F2" viewBox="0 0 24 24">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg className="h-5 w-5" fill="#0A66C2" viewBox="0 0 24 24">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);

// ===== ICON MAPPING =====
const CUSTOM_ICONS: Record<string, React.ComponentType> = {
  GoogleIcon,
  SpotifyIcon,
  DiscordIcon,
  LinkedInIcon,
};

// ===== GET ICON COMPONENT =====
const getIconComponent = (iconName: string): React.ComponentType => {
  // Check for custom icons first
  if (CUSTOM_ICONS[iconName]) {
    return CUSTOM_ICONS[iconName];
  }
  
  // Fallback to Lucide icons
  const LucideIcon = (Icons as any)[iconName];
  if (LucideIcon) {
    return () => <LucideIcon className="h-5 w-5 text-white" />;
  }
  
  // Default fallback
  return () => <PlugIcon className="h-5 w-5 text-white" />;
};

// ===== INTEGRATION CARD COMPONENT =====
interface IntegrationCardProps {
  integration: Auth0Integration;
  isConnecting: boolean;
  isLocked: boolean;
  onConnect: (integration: Auth0Integration) => void;
}

function IntegrationCard({ integration, isConnecting, isLocked, onConnect }: IntegrationCardProps) {
  const IconComponent = getIconComponent(integration.icon);

  return (
    <Card key={integration.key} className={isLocked ? 'opacity-60' : ''}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${integration.color}`}>
            <IconComponent />
          </div>
          <div className="flex-1">
            <CardTitle className="text-base">{integration.name}</CardTitle>
            {isLocked && (
              <ProBadge tier={integration.requiredTier as "PRO" | "BUSINESS"} />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">{integration.description}</p>
        <Button
          onClick={() => onConnect(integration)}
          disabled={isConnecting || isLocked}
          className="w-full"
          variant={isLocked ? 'outline' : 'default'}
        >
          {isConnecting ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Connecting...
            </>
          ) : isLocked ? (
            <>
              <LockIcon className="mr-2 h-4 w-4" />
              Requires {integration.requiredTier}
            </>
          ) : (
            'Connect'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ===== MAIN COMPONENT =====
export function IntegrationsSection() {
  const { tier } = useSubscription();
  const { user } = useUser();
  const [connectingService, setConnectingService] = useState<string | null>(null);

  const availableIntegrations = getIntegrationsForTier(tier);
  const lockedIntegrations = getLockedIntegrations(tier);

  const handleConnect = async (integration: Auth0Integration) => {
    if (!user?.id) {
      console.error('User not authenticated');
      return;
    }

    try {
      setConnectingService(integration.key);
      
      const state = createOAuthState(user.id, integration.key);
      const authUrl = buildAuthorizationUrl(
        integration.key as keyof typeof import('@/config/integrations-auth0').AUTH0_CLIENT_IDS,
        state
      );

      console.log('🔗 Initiating Auth0 OAuth flow:', {
        service: integration.key,
        tier: integration.requiredTier,
        userId: user.id,
      });

      // Redirect to Auth0
      window.location.href = authUrl;
    } catch (error) {
      console.error('Connection failed:', error);
      setConnectingService(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Integrations</CardTitle>
        <CardDescription>Connect and manage your service integrations</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="available">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="available">
              Available ({availableIntegrations.length})
            </TabsTrigger>
            <TabsTrigger value="locked">
              Locked ({lockedIntegrations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {availableIntegrations.map((integration) => (
                <IntegrationCard
                  key={integration.key}
                  integration={integration}
                  isConnecting={connectingService === integration.key}
                  isLocked={false}
                  onConnect={handleConnect}
                />
              ))}
            </div>
            {availableIntegrations.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                No integrations available for your tier
              </div>
            )}
          </TabsContent>

          <TabsContent value="locked" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {lockedIntegrations.map((integration) => (
                <IntegrationCard
                  key={integration.key}
                  integration={integration}
                  isConnecting={false}
                  isLocked={true}
                  onConnect={handleConnect}
                />
              ))}
            </div>
            {lockedIntegrations.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                You have access to all integrations!
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}