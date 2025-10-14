'use client';

import { useState, useCallback } from 'react';
import { useUser } from '@repo/auth/client';
import { toast } from '@repo/design-system/components/ui/use-toast';
import { analytics } from '@repo/analytics/posthog/client';
import type { IntegrationKey } from '../config';

/**
 * Nango Hook
 * Handles OAuth connection flow using Nango Connect UI
 * 
 * IMPORTANT: This uses the new Connect Session Token approach (not deprecated public key)
 */

interface NangoAuthOptions {
  providerConfigKey: IntegrationKey;
  connectionId?: string;
  params?: Record<string, string>;
}

interface NangoSessionResponse {
  token: string;
  expiresAt: string;
}

export function useNango() {
  const { user } = useUser();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Get Nango Connect Session Token from backend
   */
  const getSessionToken = useCallback(
    async (providerConfigKey: string): Promise<string> => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      const response = await fetch('/api/nango/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerConfigKey,
          connectionId: user.id,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create session token');
      }

      const data: NangoSessionResponse = await response.json();
      return data.token;
    },
    [user]
  );

  /**
   * Connect to an integration using Nango Connect UI
   */
  const connect = useCallback(
    async ({ providerConfigKey, connectionId, params }: NangoAuthOptions) => {
      setIsConnecting(true);
      setError(null);

      try {
        // Track analytics
        analytics.capture({
          event: 'Integration Connection Initiated',
          properties: {
            integration: providerConfigKey,
            source: 'dashboard',
          },
        });

        // Get session token from backend
        const sessionToken = await getSessionToken(providerConfigKey);

        // Dynamically import Nango SDK (client-side only)
        const { default: Nango } = await import('@nangohq/frontend');

        // Initialize Nango with session token
        const nango = new Nango({ connectSessionToken: sessionToken });

        // Open Connect UI
        return new Promise<void>((resolve, reject) => {
          nango.openConnectUI({
            sessionToken,
            onEvent: (event) => {
              console.log('Nango event:', event);

              if (event.type === 'connect.success') {
                toast({
                  title: 'Connection successful',
                  description: `Successfully connected to ${providerConfigKey}`,
                });

                // Track success
                analytics.capture({
                  event: 'Integration Connected',
                  properties: {
                    integration: providerConfigKey,
                    connectionId: event.payload?.connectionId || connectionId,
                  },
                });

                resolve();
              } else if (event.type === 'connect.error') {
                const errorMessage = event.payload?.error || 'Connection failed';
                setError(errorMessage);

                toast({
                  title: 'Connection failed',
                  description: errorMessage,
                  variant: 'destructive',
                });

                // Track failure
                analytics.capture({
                  event: 'Integration Connection Failed',
                  properties: {
                    integration: providerConfigKey,
                    error: errorMessage,
                  },
                });

                reject(new Error(errorMessage));
              } else if (event.type === 'connect.cancelled') {
                toast({
                  title: 'Connection cancelled',
                  description: 'You cancelled the connection',
                });

                reject(new Error('Connection cancelled by user'));
              }
            },
          });
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);

        toast({
          title: 'Connection error',
          description: message,
          variant: 'destructive',
        });

        // Track error
        analytics.capture({
          event: 'Integration Connection Failed',
          properties: {
            integration: providerConfigKey,
            error: message,
          },
        });

        throw err;
      } finally {
        setIsConnecting(false);
      }
    },
    [getSessionToken]
  );

  /**
   * Check if Nango is available (SDK loaded)
   */
  const isAvailable = useCallback(async () => {
    try {
      await import('@nangohq/frontend');
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    connect,
    isConnecting,
    error,
    isAvailable,
  };
}