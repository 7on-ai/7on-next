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
        body: JSON.stringify({ providerConfigKey }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('❌ Session token error:', error);
        throw new Error(error.error || 'Failed to create session token');
      }

      const data = await response.json();
      console.log('✅ Session response received:', data);
      
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
   * ตามเอกสาร: https://docs.nango.dev/guides/getting-started/authorize-an-api-from-your-app
   */
  const connect = useCallback(
    async ({ providerConfigKey }: NangoAuthOptions) => {
      setIsConnecting(true);
      setError(null);

      try {
        // Track analytics
        analytics.capture('Integration Connection Initiated', {
          integration: providerConfigKey,
          source: 'dashboard',
        });

        // Dynamically import Nango SDK
        const { default: Nango } = await import('@nangohq/frontend');

        console.log('🚀 Initializing Nango...');
        
        // ✅ ตามเอกสาร: ไม่ต้องส่ง parameter
        const nango = new Nango();
        
        console.log('✅ Nango instance created');
        console.log('🎨 Opening Connect UI...');
        
        // ✅ เปิด UI ก่อน
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
              
              // Trigger refresh
              window.dispatchEvent(new CustomEvent('nango:connected', {
                detail: { 
                  integration: providerConfigKey,
                  connectionId: event.payload?.connectionId
                }
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

        console.log('✅ Connect UI opened');
        console.log('🔑 Fetching session token...');
        
        // ✅ ดึง token ทีหลัง
        const sessionToken = await getSessionToken(providerConfigKey);
        
        console.log('✅ Token received, length:', sessionToken.length);
        console.log('🔐 Setting session token...');
        
        // ✅ ตั้ง token ทีหลัง (ตามเอกสาร!)
        connectUI.setSessionToken(sessionToken);
        
        console.log('✅ Session token set - UI should show integrations now!');

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
   * Check if Nango is available
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