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
   * ตามเอกสาร: https://docs.nango.dev/integrate/guides/authorize-an-api
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

        // Get session token from backend FIRST
        console.log('🔑 Fetching session token...');
        const sessionToken = await getSessionToken(providerConfigKey);
        console.log('✅ Token received, length:', sessionToken?.length);
        console.log('🔍 Token preview:', sessionToken?.substring(0, 20) + '...');

        console.log('🚀 Initializing Nango with session token...');

        // ✅ CRITICAL: Pass session token in constructor
        const nango = new Nango({ 
          connectSessionToken: sessionToken 
        });
        
        console.log('✅ Nango instance created');
        
        // 2. Open Connect UI (ไม่ต้อง setSessionToken ทีหลัง)
        console.log('🎨 Opening Connect UI...');
        nango.openConnectUI({
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