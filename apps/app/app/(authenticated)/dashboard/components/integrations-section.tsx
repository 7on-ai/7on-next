'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/design-system/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@repo/design-system/components/ui/tabs';
import { useSubscription } from '@repo/auth/hooks/use-subscription';
import { useNango } from '@repo/integrations/nango/hooks/use-nango';
import { useConnections } from '@repo/integrations/nango/hooks/use-connections';
import { ConnectionCard } from '@repo/integrations/components/connection-card';
import { getIntegrationsForTier, getLockedIntegrations, type IntegrationKey } from '@repo/integrations/nango/config';
import { Button } from '@repo/design-system/components/ui/button';
import { ProBadge } from '@repo/design-system/components/ui/pro-badge';
import { LockIcon } from 'lucide-react';
import * as Icons from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export function IntegrationsSection() {
  const { tier } = useSubscription();
  const { connect, isConnecting } = useNango();
  const { connections, disconnect, isConnected } = useConnections();

  const availableIntegrations = getIntegrationsForTier(tier);
  const lockedIntegrations = getLockedIntegrations(tier);

  const handleConnect = async (providerConfigKey: IntegrationKey) => {
    try {
      await connect({ providerConfigKey });
    } catch (error) {
      console.error('Connection failed:', error);
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="available">Available</TabsTrigger>
            <TabsTrigger value="connected">
              Connected ({connections.filter((c) => c.status === 'ACTIVE').length})
            </TabsTrigger>
            <TabsTrigger value="locked">Locked ({lockedIntegrations.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="available" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {availableIntegrations.map((integration) => {
                const IconComponent = (Icons[integration.icon as keyof typeof Icons] || Icons.PlugIcon) as LucideIcon;
                const connected = isConnected(integration.key);

                return (
                  <Card key={integration.key}>
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${integration.color}`}>
                          <IconComponent className="h-5 w-5 text-white" size={20} />
                        </div>
                        <div>
                          <CardTitle className="text-base">{integration.name}</CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="mb-4 text-sm text-muted-foreground">{integration.description}</p>
                      <Button
                        onClick={() => handleConnect(integration.key)}
                        disabled={isConnecting || connected}
                        className="w-full"
                        variant={connected ? 'secondary' : 'default'}
                      >
                        {connected ? 'Connected' : isConnecting ? 'Connecting...' : 'Connect'}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="connected" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {connections
                .filter((c) => c.status === 'ACTIVE')
                .map((connection) => (
                  <ConnectionCard
                    key={connection.id}
                    connection={connection}
                    onDisconnect={disconnect}
                  />
                ))}
              {connections.filter((c) => c.status === 'ACTIVE').length === 0 && (
                <div className="col-span-full py-8 text-center text-muted-foreground">
                  No active connections yet
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="locked" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {lockedIntegrations.map((integration) => {
                const IconComponent = (Icons[integration.icon as keyof typeof Icons] || Icons.PlugIcon) as LucideIcon;

                return (
                  <Card key={integration.key} className="opacity-60">
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                          <IconComponent className="h-5 w-5" size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base">{integration.name}</CardTitle>
                            <ProBadge tier={integration.requiredTier as "PRO" | "BUSINESS"} />
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="mb-4 text-sm text-muted-foreground">{integration.description}</p>
                      <Button className="w-full" variant="outline" disabled>
                        <LockIcon className="mr-2 h-4 w-4" />
                        Requires {integration.requiredTier}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}