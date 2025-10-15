'use client';

import { useState, useCallback } from 'react';
import { useUser } from '@repo/auth/client';
import { toast } from '@repo/design-system/components/ui/use-toast';
import { analytics } from '@repo/analytics/posthog/client';
import type { IntegrationKey } from '../config';

/**
 * Nango Hook
 * Handles OAuth connection flow using Nango Connect UI with Session Token
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

      console.log('🔍 Requesting session token for:', providerConfigKey);

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
        console.error('❌ Session token error:', error);
        throw new Error(error.error || 'Failed to create session token');
      }

      const data: NangoSessionResponse = await response.json();
      console.log('✅ Session token received:', {
        token: data.token.substring(0, 30) + '...',
        expiresAt: data.expiresAt
      });
      
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

        console.log('🔄 Initializing Nango SDK...');

        // ✅ METHOD 1: Pass connectSessionToken in constructor (RECOMMENDED)
        try {
          console.log('🚀 Trying Method 1: Constructor with connectSessionToken');
          const nango = new Nango({ connectSessionToken: sessionToken });

          return new Promise<void>((resolve, reject) => {
            nango.openConnectUI({
              onEvent: (event: any) => {
                console.log('📡 Nango event (Method 1):', event);

                if (event.type === 'connect') {
                  toast.success('Connection successful', `Successfully connected to ${providerConfigKey}`);

                  analytics.capture('Integration Connected', {
                    integration: providerConfigKey,
                    connectionId: event.payload?.connectionId || connectionId,
                  });

                  resolve();
                } else if (event.type === 'error') {
                  const errorMessage = event.payload?.error || 'Connection failed';
                  setError(errorMessage);

                  toast.error('Connection failed', errorMessage);

                  analytics.capture('Integration Connection Failed', {
                    integration: providerConfigKey,
                    error: errorMessage,
                  });

                  reject(new Error(errorMessage));
                } else if (event.type === 'close') {
                  console.log('🔒 Connect UI closed');
                }
              },
            });
          });
        } catch (method1Error) {
          console.warn('⚠️ Method 1 failed, trying Method 2...', method1Error);

          // ✅ METHOD 2: Use setSessionToken (FALLBACK)
          console.log('🚀 Trying Method 2: setSessionToken');
          const nango = new Nango();
          
          // Check if setSessionToken exists
          if (typeof nango.setSessionToken === 'function') {
            nango.setSessionToken(sessionToken);
          } else {
            throw new Error('Neither connectSessionToken constructor nor setSessionToken method is available');
          }

          return new Promise<void>((resolve, reject) => {
            nango.openConnectUI({
              onEvent: (event: any) => {
                console.log('📡 Nango event (Method 2):', event);

                if (event.type === 'connect') {
                  toast.success('Connection successful', `Successfully connected to ${providerConfigKey}`);

                  analytics.capture('Integration Connected', {
                    integration: providerConfigKey,
                    connectionId: event.payload?.connectionId || connectionId,
                  });

                  resolve();
                } else if (event.type === 'error') {
                  const errorMessage = event.payload?.error || 'Connection failed';
                  setError(errorMessage);

                  toast.error('Connection failed', errorMessage);

                  analytics.capture('Integration Connection Failed', {
                    integration: providerConfigKey,
                    error: errorMessage,
                  });

                  reject(new Error(errorMessage));
                } else if (event.type === 'close') {
                  console.log('🔒 Connect UI closed');
                }
              },
            });
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setError(message);

        console.error('💥 Connection error:', err);

        toast.error('Connection error', message);

        analytics.capture('Integration Connection Failed', {
          integration: providerConfigKey,
          error: message,
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
}git add