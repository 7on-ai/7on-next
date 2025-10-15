'use client';

import { useState, useCallback } from 'react';
import { useUser } from '@repo/auth/client';
import { toast } from '@repo/design-system/components/ui/use-toast';
import { analytics } from '@repo/analytics/posthog/client';
import type { IntegrationKey } from '../config';

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

      console.log('🔍 Requesting session token for:', providerConfigKey);

      const response = await fetch('/api/nango/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerConfigKey,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Session token error:', error);
        throw new Error(error.error || 'Failed to create session token');
      }

      const data: NangoSessionResponse = await response.json();
      console.log('✅ Session token received');
      
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
        analytics.capture('Integration Connection Initiated', {
          integration: providerConfigKey,
          source: 'dashboard',
        });

        // Get session token from backend
        const sessionToken = await getSessionToken(providerConfigKey);

        // Dynamically import Nango SDK (client-side only)
        const { default: Nango } = await import('@nangohq/frontend');

        console.log('🔄 Initializing Nango Connect UI...');

        // ✅ CORRECT METHOD: Use the new Nango Connect UI pattern
        const nango = new Nango();
        
        const connectUI = nango.openConnectUI({
          onEvent: (event: any) => {
            console.log('📡 Nango event:', event);

            if (event.type === 'connect') {
              toast.success('Connection successful', `Successfully connected to ${providerConfigKey}`);

              analytics.capture('Integration Connected', {
                integration: providerConfigKey,
                connectionId: event.payload?.connectionId,
              });

              setIsConnecting(false);
            } else if (event.type === 'error') {
              const errorMessage = event.payload?.error || 'Connection failed';
              setError(errorMessage);

              toast.error('Connection failed', errorMessage);

              analytics.capture('Integration Connection Failed', {
                integration: providerConfigKey,
                error: errorMessage,
              });

              setIsConnecting(false);
            } else if (event.type === 'close') {
              console.log('🔒 Connect UI closed');
              setIsConnecting(false);
            }
          },
        });

        // Set the session token (this will open the UI)
        connectUI.setSessionToken(sessionToken);

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);

        console.error('💥 Connection error:', err);

        toast.error('Connection error', message);

        analytics.capture('Integration Connection Failed', {
          integration: providerConfigKey,
          error: message,
        });

        setIsConnecting(false);
        throw err;
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