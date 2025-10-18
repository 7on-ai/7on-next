'use client';

import { useState, useCallback } from 'react';
import { useUser } from '@repo/auth/client';
import { toast } from '@repo/design-system/components/ui/use-toast';
import { analytics } from '@repo/analytics/posthog/client';
import type { IntegrationKey } from '../config';

interface NangoAuthOptions {
  providerConfigKey: IntegrationKey;
}

export function useNango() {
  const { user } = useUser();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getSessionToken = useCallback(
    async (providerConfigKey: string): Promise<string> => {
      if (!user?.id) {
        throw new Error('User not authenticated');
      }

      console.log('🔑 Requesting session token for:', providerConfigKey);

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
      
      if (!data.token) {
        throw new Error('Session token not found in response');
      }
      
      console.log('✅ Session token received');
      return data.token;
    },
    [user]
  );

  const connect = useCallback(
    async ({ providerConfigKey }: NangoAuthOptions) => {
      setIsConnecting(true);
      setError(null);

      try {
        analytics.capture('Integration Connection Initiated', {
          integration: providerConfigKey,
        });

        // ✅ Import Nango SDK
        const { default: Nango } = await import('@nangohq/frontend');

        console.log('🔑 Fetching session token...');
        const sessionToken = await getSessionToken(providerConfigKey);
        console.log('✅ Token received');

        // ✅ สร้าง Nango instance ด้วย connectSessionToken
        const nango = new Nango({ connectSessionToken: sessionToken });
        
        console.log('🎨 Opening Connect UI...');
        
        // ✅ เปิด Connect UI โดยไม่ต้องส่ง allowed_integrations 
        // (เพราะกำหนดไว้ใน session token แล้ว)
        nango.openConnectUI({
          onEvent: (event: any) => {
            console.log('📡 Nango event:', event);

            if (event.type === 'connect') {
              console.log('✅ Connection successful!', event.payload);
              
              toast.success(
                'Connected', 
                `Successfully connected to ${providerConfigKey}`
              );

              analytics.capture('Integration Connected', {
                integration: providerConfigKey,
                connectionId: event.payload?.connectionId,
              });

              setIsConnecting(false);
              
              // Trigger refresh
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

  return {
    connect,
    isConnecting,
    error,
  };
}