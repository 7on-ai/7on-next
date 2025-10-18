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

      const data = await response.json();
      console.log('✅ Session response received:', data);
      console.log('🔍 Token exists:', !!data.token);
      console.log('🔍 Token length:', data.token?.length);
      
      if (!data.token) {
        console.error('❌ No token in response:', data);
        throw new Error('Session token not found in response');
      }
      
      return data.token;
    },
    [user]
  );

  /**
   * Connect to an integration using Nango Connect UI
   * https://docs.nango.dev/integrate/guides/authorize-an-api
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

        // Dynamically import Nango SDK (client-side only)
        const { default: Nango } = await import('@nangohq/frontend');

        console.log('🚀 Initializing Nango...');

        // Initialize Nango without session token first
        const nango = new Nango();
        
        console.log('✅ Nango instance created');
        
        // Open Connect UI
        console.log('🎨 Opening Connect UI...');
        const connectUI = nango.openConnectUI({
          onEvent: (event: any) => {
            console.log('📡 Nango event:', event);

            if (event.type === 'connect') {
              console.log('✅ Connection successful!', event.payload);
              
              toast.success('Connected', `Successfully connected to ${providerConfigKey}`);

              analytics.capture('Integration Connected', {
                integration: providerConfigKey,
                connectionId: event.payload?.connectionId,
              });

              setIsConnecting(false);
              
              // Trigger refresh of connections list
              window.dispatchEvent(new CustomEvent('nango:connected', {
                detail: { integration: providerConfigKey }
              }));
              
            } else if (event.type === 'error') {
              const errorMessage = event.payload?.error || 'Connection failed';
              console.error('❌ Connection error:', errorMessage);
              
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

        // Get session token and set it asynchronously (recommended by Nango)
        console.log('🔑 Fetching session token...');
        const sessionToken = await getSessionToken(providerConfigKey);
        console.log('✅ Token received, length:', sessionToken?.length);
        console.log('🔍 Token preview:', sessionToken?.substring(0, 20) + '...');
        
        // Set session token after UI is opened
        console.log('🔐 Setting session token...');
        connectUI.setSessionToken(sessionToken);
        console.log('✅ Session token set successfully');

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